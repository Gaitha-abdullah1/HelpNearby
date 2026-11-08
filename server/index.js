import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "./models/User.js";
import Service from "./models/Service.js";
import Category from "./models/Category.js";
import {
  activeCategoryIds,
  activeServiceCategory,
  categoryIdValue,
  categoryUsageCounts,
  refreshKnownCategories,
  toAdminCategory,
  toPublicCategory,
} from "./categories.js";
import HelpRequest from "./models/HelpRequest.js";
import Counter from "./models/Counter.js";
import Notification from "./models/Notification.js";
import Activity from "./models/Activity.js";
import Feedback from "./models/Feedback.js";
import { isInsideMuscat, MUSCAT_WILAYATS } from "./muscatBoundary.js";
import nodemailer from "nodemailer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import verificationEmail from "./emails/verificationEmail.js";
import passwordResetEmail from "./emails/passwordResetEmail.js";
import volunteerApprovalEmail from "./emails/volunteerApprovalEmail.js";
import volunteerRejectionEmail from "./emails/volunteerRejectionEmail.js";
import volunteerApplicationReceivedEmail from "./emails/volunteerApplicationReceivedEmail.js";
import accountBlockedEmail from "./emails/accountBlockedEmail.js";
import accountUnblockedEmail from "./emails/accountUnblockedEmail.js";
import { createServer } from "node:http";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { Server } from "socket.io";
import dns from "node:dns/promises";
dns.setServers(["8.8.8.8", "1.1.1.1"]);
const generateVerificationCode = () => randomInt(100000, 1000000).toString();

const app = express();
const PORT = 5000;
const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({
  path: path.join(serverDirectory, ".env"),
  quiet: true,
});

const readEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Add it to server/.env.`);
  }
  return value;
};

const requestEmailLanguage = (req) => {
  const values = [req.body?.language, req.headers?.["accept-language"]];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const first = value.split(",")[0].trim().toLowerCase();
    if (first === "ar" || first.startsWith("ar-")) return "ar";
    if (first === "en" || first.startsWith("en-")) return "en";
  }
  return "en";
};

const transporter = nodemailer.createTransport({
  host: readEnv("SMTP_HOST"),
  port: Number(readEnv("SMTP_PORT")),
  secure: readEnv("SMTP_SECURE") === "true",
  auth: {
    user: readEnv("SMTP_USER"),
    pass: readEnv("SMTP_PASS"),
  },
});

app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
});
const NOTIFICATION_RETENTION_MS = 2592000 * 1000;

const notificationRoom = (userId) => String(userId);
const socketsByUser = new Map();

const trackSocket = (userId, socket) => {
  const key = String(userId);
  const sockets = socketsByUser.get(key) || new Set();
  sockets.add(socket);
  socketsByUser.set(key, sockets);
  socket.on("disconnect", () => {
    sockets.delete(socket);
    if (sockets.size === 0) socketsByUser.delete(key);
  });
};

const emitToUserSockets = (userId, event, payload) => {
  const sockets = socketsByUser.get(String(userId));
  if (!sockets) return;
  for (const socket of sockets) socket.emit(event, payload);
};

const toPublicNotification = (notification, requestStatus = null) => {
  const requestNumber = Number(notification.requestNumber);
  const status = typeof requestStatus === "string" && requestStatus ? requestStatus : null;
  return {
    id: notification._id.toString(),
    type: notification.type,
    relatedRequestId: notification.relatedRequestId
      ? notification.relatedRequestId.toString()
      : null,
    ...(status ? { requestStatus: status } : {}),
    ...(Number.isInteger(requestNumber) ? { requestNumber } : {}),
    createdAt: notification.createdAt,
  };
};

const withRequestNumber = (entry, request) => {
  const requestNumber = Number(request?.requestNumber);
  if (!entry || !Number.isInteger(requestNumber)) return entry;
  return { ...entry, requestNumber };
};

const roadRouteCache = new Map();
const roadRouteFlights = new Map();
const ROUTE_REFRESH_MS = 60 * 1000;
const ROUTE_REFRESH_METERS = 250;
const ORS_DIRECTIONS_URL = "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson";

const clearRoadRoute = (requestId) => {
  const id = String(requestId);
  roadRouteCache.delete(id);
  roadRouteFlights.delete(id);
};

const metersBetween = (fromLatitude, fromLongitude, toLatitude, toLongitude) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const startLatitude = toRadians(fromLatitude);
  const endLatitude = toRadians(toLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const sameRoutePoint = (left, right) =>
  left?.latitude === right?.latitude && left?.longitude === right?.longitude;

const canReuseRoadRoute = (cached, origin, destination, now) => {
  if (!cached?.origin || !cached?.destination) return false;
  if (!sameRoutePoint(cached.destination, destination)) return false;
  const age = now - new Date(cached.routedAt).getTime();
  const moved = metersBetween(
    cached.origin.latitude,
    cached.origin.longitude,
    origin.latitude,
    origin.longitude,
  );
  return age < ROUTE_REFRESH_MS || moved <= ROUTE_REFRESH_METERS;
};

const fetchDrivingRoute = async (origin, destination) => {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    return { errorCode: "ROUTE_NOT_CONFIGURED", status: 503 };
  }

  let response;
  try {
    response = await fetch(ORS_DIRECTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: apiKey.trim(),
        "Content-Type": "application/json",
        Accept: "application/geo+json, application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [origin.longitude, origin.latitude],
          [destination.longitude, destination.latitude],
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error("Road route request failed:", error?.name || "network");
    return { errorCode: "ROUTE_SERVICE_UNAVAILABLE", status: 503 };
  }

  if (response.status === 429) {
    return { errorCode: "ROUTE_RATE_LIMITED", status: 429 };
  }
  if (response.status === 403) {
    return { errorCode: "ROUTE_QUOTA", status: 429 };
  }
  if (!response.ok) {
    return { errorCode: "ROUTE_UNAVAILABLE", status: 502 };
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return { errorCode: "ROUTE_UNAVAILABLE", status: 502 };
  }

  const feature = body?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const summary = feature?.properties?.summary;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return { errorCode: "ROUTE_UNAVAILABLE", status: 502 };
  }

  const points = coordinates
    .map((pair) => ({
      longitude: Number(pair?.[0]),
      latitude: Number(pair?.[1]),
    }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  const distanceMeters = Number(summary?.distance);
  const durationSeconds = Number(summary?.duration);
  if (points.length < 2 || !Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
    return { errorCode: "ROUTE_UNAVAILABLE", status: 502 };
  }

  return {
    route: {
      points,
      distanceMeters,
      durationSeconds,
      routedAt: new Date().toISOString(),
      origin,
      destination,
    },
  };
};

io.on("connection", (socket) => {
  const userId = socket.handshake.auth?.userId;
  if (typeof userId === "string" && mongoose.isValidObjectId(userId)) {
    trackSocket(userId, socket);
  }
  (async () => {
    if (typeof userId !== "string" || !mongoose.isValidObjectId(userId)) return;
    const account = await User.findById(userId).select("accountStatus").lean();
    if (!account) return;
    if (account.accountStatus === "blocked") {
      socket.emit("account_blocked");
      setTimeout(() => socket.disconnect(true), 1000);
      return;
    }
    socket.join(notificationRoom(userId));
  })();
});

const recordActivity = async (entry) => {
  try {
    return await Activity.create(entry);
  } catch (error) {
    console.error("Activity record failed:", error);
    return null;
  }
};

const createNotifications = async (entries, tracker = null) => {
  const documents = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
  if (!documents.length) return true;

  try {
    const saved = await Notification.insertMany(documents);
    if (tracker) tracker.ids = saved.map((item) => item._id).filter(Boolean);
    for (const notification of saved) {
      io.to(notificationRoom(notification.userId)).emit(
        "new_notification",
        toPublicNotification(notification),
      );
    }
    return saved;
  } catch (error) {
    const partial = Array.isArray(error?.insertedDocs) ? error.insertedDocs : [];
    if (tracker) tracker.ids = partial.map((item) => item._id).filter(Boolean);
    console.error("Notification create failed:", {
      types: documents.map((item) => item.type),
      userIds: documents.map((item) => String(item.userId)),
      error,
    });
    return false;
  }
};

const ACCEPTANCE_REMINDER_MS = 25 * 60 * 1000;
const ACCEPTANCE_TIMEOUT_MS = 30 * 60 * 1000;
const TIMEOUT_CHECK_MS = 45000;
let timeoutCheckRunning = false;

const processAcceptanceTimeouts = async () => {
  if (timeoutCheckRunning) return;
  timeoutCheckRunning = true;

  try {
    const now = Date.now();
    const expireBefore = new Date(now - ACCEPTANCE_TIMEOUT_MS);
    const reminderBefore = new Date(now - ACCEPTANCE_REMINDER_MS);

    const expirations = await HelpRequest.find({
      status: "accepted",
      acceptedAt: { $ne: null, $lte: expireBefore },
    })
      .select("_id userId volunteerId acceptedAt")
      .limit(50)
      .lean();

    for (const candidate of expirations) {
      const previousVolunteerId = candidate.volunteerId;
      const expired = await HelpRequest.findOneAndUpdate(
        {
          _id: candidate._id,
          status: "accepted",
          volunteerId: candidate.volunteerId,
          acceptedAt: candidate.acceptedAt,
        },
        {
          status: "pending",
          volunteerId: null,
          acceptedAt: null,
          reminderSent: false,
        },
      );

      if (!expired) continue;
      await releaseVolunteerRequest(candidate.volunteerId, expired._id);
      clearRoadRoute(expired._id);
      await recordActivity({
        type: "help_request_assignment_expired",
        userId: previousVolunteerId,
        relatedRequestId: expired._id,
      });

      const notified = await createNotifications([
        withRequestNumber({
          userId: expired.volunteerId,
          type: "help_request_assignment_expired",
          relatedRequestId: expired._id,
        }, expired),
        withRequestNumber({
          userId: expired.userId,
          type: "help_request_reopened",
          relatedRequestId: expired._id,
        }, expired),
      ]);

      if (!notified) {
        console.error("Assignment expiry notifications were not saved:", {
          requestId: String(expired._id),
        });
      }

      const reopened = await HelpRequest.findById(expired._id);
      if (reopened) await advanceHelpRequestOffer(reopened, [candidate.volunteerId]);
      await recoverOpenBoardForVolunteer(candidate.volunteerId, {
        exceptRequestId: expired._id,
      });
    }

    const reminders = await HelpRequest.find({
      status: "accepted",
      reminderSent: { $ne: true },
      acceptedAt: { $ne: null, $lte: reminderBefore, $gt: expireBefore },
    })
      .select("_id volunteerId acceptedAt")
      .limit(50)
      .lean();

    for (const candidate of reminders) {
      const claimed = await HelpRequest.findOneAndUpdate(
        {
          _id: candidate._id,
          status: "accepted",
          volunteerId: candidate.volunteerId,
          acceptedAt: candidate.acceptedAt,
          reminderSent: { $ne: true },
        },
        { reminderSent: true },
      );

      if (!claimed?.volunteerId) continue;

      const notified = await createNotifications(withRequestNumber({
        userId: claimed.volunteerId,
        type: "help_request_start_reminder",
        relatedRequestId: claimed._id,
      }, claimed));

      if (!notified) {
        await HelpRequest.updateOne(
          { _id: claimed._id, status: "accepted", reminderSent: true },
          { reminderSent: false },
        );
        console.error("Start reminder notification was not saved:", {
          requestId: String(claimed._id),
        });
      }
    }
  } catch (error) {
    console.error("Acceptance timeout check failed:", error);
  } finally {
    timeoutCheckRunning = false;
  }
};
app.use("/assets", express.static(path.join(serverDirectory, "assets")));

app.post("/api/auth/register/user", async (req, res) => {
  try {
    const fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
    const { password } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      if (!existingUser.isEmailVerified) {
        return res.status(409).json({
          errorCode: "EMAIL_NOT_VERIFIED",
        });
      }

      return res.status(409).json({
        errorCode: "EMAIL_ALREADY_REGISTERED",
      });
    }

    if (!FULL_NAME_PATTERN.test(fullName)) {
      return res.status(400).json({ errorCode: "INVALID_FULL_NAME" });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ errorCode: "INVALID_EMAIL" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ errorCode: "INVALID_PASSWORD" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const verificationCode = generateVerificationCode();

    const verificationCodeExpires = new Date(Date.now() + 5 * 60 * 1000);

    const user = await User.create({
      fullName,
      email,
      password: hashedPassword,
      role: "user",
      volunteerStatus: "not-applicable",
      isEmailVerified: false,
      verificationCode,
      verificationCodeExpires,
    });

    const emailContent = verificationEmail(verificationCode, requestEmailLanguage(req));

    await transporter.sendMail({
      from: '"HelpNearby" <tre3lc@gmail.com>',
      to: email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });

    res.status(201).json({
      messageCode: "REGISTRATION_SUCCESS",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("Register user error:", error);

    res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.post("/api/auth/register/volunteer", async (req, res) => {
  try {
    const fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const { password, skills } = req.body;

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      if (!existingUser.isEmailVerified) {
        return res.status(409).json({
          errorCode: "EMAIL_NOT_VERIFIED",
        });
      }

      return res.status(409).json({
        errorCode: "EMAIL_ALREADY_REGISTERED",
      });
    }

    if (!FULL_NAME_PATTERN.test(fullName)) {
      return res.status(400).json({ errorCode: "INVALID_FULL_NAME" });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ errorCode: "INVALID_EMAIL" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ errorCode: "INVALID_PASSWORD" });
    }
    if (!PHONE_PATTERN.test(phone)) {
      return res.status(400).json({ errorCode: "INVALID_PHONE" });
    }

    const birthDate = parseProfileBirthDate(req.body.dateOfBirth);
    const today = new Date();
    const todayValue = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    if (!birthDate) return res.status(400).json({ errorCode: "INVALID_DATE_OF_BIRTH" });
    const birthValue = birthDate.year * 10000 + birthDate.month * 100 + birthDate.day;
    if (birthValue < 19000101 || birthValue > todayValue) {
      return res.status(400).json({ errorCode: "INVALID_DATE_OF_BIRTH" });
    }
    if (!isAdultBirthDate(birthDate.year, birthDate.month, birthDate.day)) {
      return res.status(400).json({ errorCode: "DATE_OF_BIRTH_UNDERAGE" });
    }

    const skillResult = await readVolunteerSkills(skills);
    if (skillResult.errorCode) {
      return res.status(400).json({ errorCode: skillResult.errorCode });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const verificationCodeExpires = new Date(Date.now() + 5 * 60 * 1000);

    const user = new User({
      fullName,
      email,
      password: hashedPassword,
      phone,
      skills: skillResult.skills,
      dateOfBirth: birthDate.utcDate,
      role: "user",
      volunteerStatus: "pending",
      isEmailVerified: false,
      verificationCode,
      verificationCodeExpires,
    });
    ensureApplicationHistory(user);
    await user.save();

    const emailContent = verificationEmail(verificationCode, requestEmailLanguage(req));

    try {
      await transporter.sendMail({
        from: '"HelpNearby" <tre3lc@gmail.com>',
        to: user.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
    } catch {
      await User.deleteOne({ _id: user._id });
      console.error("Volunteer registration email delivery failed.");

      return res.status(500).json({
        errorCode: "SERVER_ERROR",
      });
    }

    return res.status(201).json({
      messageCode: "VOLUNTEER_REGISTRATION_SUCCESS",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        volunteerStatus: user.volunteerStatus,
      },
    });
  } catch (error) {
    console.error("Register volunteer error:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.post("/api/auth/verify-email", async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        errorCode: "EMAIL_ALREADY_VERIFIED",
      });
    }

    if (typeof code !== "string" || !/^[0-9]{6}$/.test(code) || user.verificationCode !== code) {
      return res.status(400).json({
        errorCode: "INVALID_VERIFICATION_CODE",
      });
    }

    if (
      !user.verificationCodeExpires ||
      user.verificationCodeExpires < new Date()
    ) {
      return res.status(400).json({
        errorCode: "VERIFICATION_CODE_EXPIRED",
      });
    }

    user.isEmailVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;

    await user.save();

    if (user.role === "user" && user.volunteerStatus === "pending") {
      try {
        const emailContent = volunteerApplicationReceivedEmail(requestEmailLanguage(req));

        await transporter.sendMail({
          from: '"HelpNearby" <tre3lc@gmail.com>',
          to: user.email,
          subject: emailContent.subject,
          text: emailContent.text,
          html: emailContent.html,
        });
      } catch (emailError) {
        console.error(
          "Volunteer application received email delivery failed:",
          emailError,
        );
      }

      const admins = await User.find({
        role: "admin",
        accountStatus: { $ne: "blocked" },
      }).select("_id").lean();
      await createNotifications(admins.map((admin) => ({
        userId: admin._id,
        type: "volunteer_application_submitted",
      })));
      const existingSubmission = await Activity.findOne({
        type: "volunteer_application_submitted",
        userId: user._id,
      }).select("_id");
      if (!existingSubmission) {
        await recordActivity({
          type: "volunteer_application_submitted",
          userId: user._id,
        });
      }
    }

    return res.status(200).json({
      messageCode: "EMAIL_VERIFIED_SUCCESS",
    });
  } catch (error) {
    console.error("Verify email error:", error);

    res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        errorCode: "EMAIL_ALREADY_VERIFIED",
      });
    }

    const verificationCode = generateVerificationCode();

    const verificationCodeExpires = new Date(Date.now() + 5 * 60 * 1000);

    user.verificationCode = verificationCode;
    user.verificationCodeExpires = verificationCodeExpires;

    await user.save();

    const emailContent = verificationEmail(verificationCode, requestEmailLanguage(req));

    await transporter.sendMail({
      from: '"HelpNearby" <tre3lc@gmail.com>',
      to: email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });

    res.status(200).json({
      messageCode: "VERIFICATION_CODE_RESENT",
    });
  } catch (error) {
    console.error("Resend verification error:", error);

    res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = email ? await User.findOne({ email }) : null;

    if (!user) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
      });
    }

    const rawToken = randomBytes(32).toString("hex");
    const hashedToken = createHash("sha256").update(rawToken).digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordTokenExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    const resetLink = `http://localhost:5173/reset-password?token=${rawToken}`;
    const emailContent = passwordResetEmail(resetLink, requestEmailLanguage(req));

    try {
      await transporter.sendMail({
        from: '"HelpNearby" <tre3lc@gmail.com>',
        to: user.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
    } catch {
      console.error("Password reset email delivery failed.");
    }

    return res.status(200).json({
      messageCode: "PASSWORD_RESET_EMAIL_SENT",
    });
  } catch {
    console.error("Forgot password request failed.");

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (typeof token !== "string" || !token || !isValidPassword(password)) {
      return res.status(400).json({
        errorCode: "INVALID_RESET_REQUEST",
      });
    }

    const hashedToken = createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ resetPasswordToken: hashedToken });

    if (!user) {
      return res.status(400).json({
        errorCode: "INVALID_RESET_TOKEN",
      });
    }

    if (
      !user.resetPasswordTokenExpires ||
      user.resetPasswordTokenExpires < new Date()
    ) {
      return res.status(400).json({
        errorCode: "RESET_TOKEN_EXPIRED",
      });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordTokenExpires = null;

    await user.save();

    return res.status(200).json({
      messageCode: "PASSWORD_RESET_SUCCESS",
    });
  } catch {
    console.error("Password reset failed.");

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        errorCode: "INVALID_CREDENTIALS",
      });
    }

    if (user.accountStatus === "blocked") {
      return res.status(403).json({
        errorCode: "ACCOUNT_BLOCKED",
      });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        errorCode: "EMAIL_NOT_VERIFIED",
      });
    }

    if (user.role === "user" && user.volunteerStatus === "pending") {
      return res.status(403).json({
        errorCode: "VOLUNTEER_APPLICATION_PENDING",
      });
    }

    if (user.role === "volunteer" && user.volunteerStatus === "rejected") {
      return res.status(403).json({
        errorCode: "VOLUNTEER_APPLICATION_REJECTED",
      });
    }

    if (user.role === "user" && user.volunteerStatus === "rejected") {
      if (ensureApplicationHistory(user)) {
        user.markModified("applicationHistory");
        await user.save();
      }
    }

    res.status(200).json({
      messageCode: "LOGIN_SUCCESS",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        profileImage: user.profileImage,
        role: user.role,
        phone: user.phone,
        skills: storedVolunteerSkills(user.skills),
        dateOfBirth: user.dateOfBirth,
        isEmailVerified: user.isEmailVerified,
        volunteerStatus: user.volunteerStatus,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.get("/api/admin/volunteers/pending", async (_req, res) => {
  try {
    const volunteers = await User.find({
      role: "user",
      volunteerStatus: "pending",
      isEmailVerified: true,
    })
      .select("fullName email phone skills dateOfBirth createdAt applicationHistory")
      .lean();

    return res.status(200).json({
      volunteers: volunteers.map(({ _id, applicationHistory, ...volunteer }) => {
        const history = sortHistory(
          (Array.isArray(applicationHistory) ? applicationHistory : []).map(toPublicHistoryEntry),
        );
        const currentPending = [...history].reverse().find((entry) => entry.status === "pending") || null;

        return {
          id: _id.toString(),
          ...volunteer,
          skills: storedVolunteerSkills(volunteer.skills),
          applicationHistory: history,
          currentApplicationNumber: currentPending?.applicationNumber ?? null,
          currentSubmittedAt: currentPending?.submittedAt ?? volunteer.createdAt ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Fetch pending volunteers failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.put("/api/admin/volunteers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { volunteerStatus } = req.body;

    if (!["approved", "rejected"].includes(volunteerStatus)) {
      return res.status(400).json({
        errorCode: "INVALID_VOLUNTEER_STATUS",
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        errorCode: "INVALID_VOLUNTEER_ID",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        errorCode: "VOLUNTEER_NOT_FOUND",
      });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        errorCode: "VOLUNTEER_EMAIL_NOT_VERIFIED",
      });
    }

    if (user.role !== "user" || user.volunteerStatus !== "pending") {
      return res.status(409).json({
        errorCode: "VOLUNTEER_APPLICATION_NOT_PENDING",
      });
    }

    const isApproval = volunteerStatus === "approved";
    const rejectionReasonEn = isApproval
      ? ""
      : (typeof req.body.rejectionReasonEn === "string" && req.body.rejectionReasonEn.trim())
        || (typeof req.body.rejectionReason === "string" && req.body.rejectionReason.trim())
        || "";
    const rejectionReasonAr = isApproval
      ? ""
      : typeof req.body.rejectionReasonAr === "string"
        ? req.body.rejectionReasonAr.trim()
        : "";

    if (!isApproval && (!rejectionReasonEn || !rejectionReasonAr)) {
      return res.status(400).json({ errorCode: "REJECTION_REASON_REQUIRED" });
    }
    if (
      !isApproval &&
      (rejectionReasonEn.length > REJECTION_REASON_MAX || rejectionReasonAr.length > REJECTION_REASON_MAX)
    ) {
      return res.status(400).json({ errorCode: "REJECTION_REASON_TOO_LONG" });
    }

    ensureApplicationHistory(user);
    const application = currentPendingApplication(user);
    if (!application) {
      return res.status(409).json({ errorCode: "VOLUNTEER_APPLICATION_NOT_PENDING" });
    }

    const decidedAt = new Date();
    const reviewerId = readReviewerId(req.body.adminId);
    application.status = volunteerStatus;
    application.decidedAt = decidedAt;
    application.reviewedBy = reviewerId;
    application.rejectionReason = isApproval ? null : rejectionReasonEn;
    application.rejectionReasonEn = isApproval ? null : rejectionReasonEn;
    application.rejectionReasonAr = isApproval ? null : rejectionReasonAr;
    user.role = isApproval ? "volunteer" : "user";
    user.volunteerStatus = volunteerStatus;
    user.rejectionReason = isApproval ? null : rejectionReasonEn;
    user.rejectionReasonEn = isApproval ? null : rejectionReasonEn;
    user.rejectionReasonAr = isApproval ? null : rejectionReasonAr;
    user.markModified("applicationHistory");

    const saved = await User.findOneAndUpdate(
      { _id: user._id, role: "user", volunteerStatus: "pending" },
      {
        $set: {
          role: user.role,
          volunteerStatus: user.volunteerStatus,
          rejectionReason: user.rejectionReason,
          rejectionReasonEn: user.rejectionReasonEn,
          rejectionReasonAr: user.rejectionReasonAr,
          applicationHistory: historySnapshot(user.applicationHistory),
        },
      },
      { new: true },
    );
    if (!saved) {
      return res.status(409).json({ errorCode: "VOLUNTEER_APPLICATION_NOT_PENDING" });
    }

    const emailContent = isApproval
      ? volunteerApprovalEmail("en")
      : volunteerRejectionEmail({
        english: rejectionReasonEn,
        arabic: rejectionReasonAr,
        language: "en",
      });

    try {
      await transporter.sendMail({
        from: '"HelpNearby" <tre3lc@gmail.com>',
        to: user.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
    } catch (emailError) {
      const savedApplication = (user.applicationHistory || []).find(
        (entry) => entry.applicationNumber === application.applicationNumber,
      );
      if (savedApplication) restorePendingApplication(savedApplication);
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            role: "user",
            volunteerStatus: "pending",
            rejectionReason: null,
            rejectionReasonEn: null,
            rejectionReasonAr: null,
            applicationHistory: historySnapshot(user.applicationHistory),
          },
        },
      );
      console.error(
        `Volunteer ${volunteerStatus} email delivery failed:`,
        emailError,
      );

      return res.status(500).json({
        errorCode: "SERVER_ERROR",
      });
    }

    await recordActivity({
      type: isApproval
        ? "volunteer_application_approved"
        : "volunteer_application_rejected",
      userId: user._id,
    });
    await createNotifications({
      userId: user._id,
      type: isApproval
        ? "volunteer_application_approved"
        : "volunteer_application_rejected",
    });
    if (isApproval) await recoverOpenBoardForVolunteer(saved);

    return res.status(200).json({
      messageCode: isApproval ? "VOLUNTEER_APPROVED" : "VOLUNTEER_REJECTED",
    });
  } catch (error) {
    console.error("Update volunteer status failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.get("/api/admin/volunteers/rejected", async (_req, res) => {
  try {
    const volunteers = await User.find({
      role: "user",
      volunteerStatus: "rejected",
      isEmailVerified: true,
    })
      .select("fullName email phone skills dateOfBirth createdAt applicationHistory rejectionReason rejectionReasonEn rejectionReasonAr")
      .lean();

    return res.status(200).json({
      volunteers: volunteers.map(({ _id, applicationHistory, ...volunteer }) => {
        const history = sortHistory(
          (Array.isArray(applicationHistory) ? applicationHistory : []).map(toPublicHistoryEntry),
        );
        const latestRejected = [...history].reverse().find((entry) => entry.status === "rejected") || null;

        return {
          id: _id.toString(),
          ...volunteer,
          skills: storedVolunteerSkills(volunteer.skills),
          applicationHistory: history,
          currentApplicationNumber: latestRejected?.applicationNumber ?? null,
          decidedAt: latestRejected?.decidedAt ?? null,
          rejectionReason: latestRejected?.rejectionReason ?? trimmedOrNull(volunteer.rejectionReason),
          rejectionReasonEn: latestRejected?.rejectionReasonEn ?? trimmedOrNull(volunteer.rejectionReasonEn),
          rejectionReasonAr: latestRejected?.rejectionReasonAr ?? trimmedOrNull(volunteer.rejectionReasonAr),
        };
      }),
    });
  } catch (error) {
    console.error("Fetch rejected volunteers failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/volunteer/application-status", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.query.userId)) {
      return res.status(400).json({ errorCode: "INVALID_USER_ID" });
    }

    const user = await User.findById(req.query.userId).select("role volunteerStatus");
    if (!user) return res.status(404).json({ errorCode: "USER_NOT_FOUND" });

    return res.status(200).json({
      role: user.role,
      volunteerStatus: user.volunteerStatus,
    });
  } catch (error) {
    console.error("Fetch application status failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/volunteer/rejection-reason", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.query.userId)) {
      return res.status(400).json({ errorCode: "INVALID_USER_ID" });
    }

    const user = await User.findById(req.query.userId).select(
      "role volunteerStatus applicationHistory rejectionReason rejectionReasonEn rejectionReasonAr",
    );
    if (!user) return res.status(404).json({ errorCode: "USER_NOT_FOUND" });
    if (user.role !== "user" || user.volunteerStatus !== "rejected") {
      return res.status(409).json({ errorCode: "VOLUNTEER_APPLICATION_NOT_REJECTED" });
    }

    const latest = latestHistoryEntry(user, "rejected");
    return res.status(200).json({
      applicationNumber: Number.isInteger(latest?.applicationNumber) ? latest.applicationNumber : null,
      submittedAt: latest?.submittedAt || null,
      decidedAt: latest?.decidedAt || null,
      status: latest?.status || "rejected",
      rejectionReason: trimmedOrNull(latest?.rejectionReason) || trimmedOrNull(user.rejectionReason),
      rejectionReasonEn: trimmedOrNull(latest?.rejectionReasonEn) || trimmedOrNull(user.rejectionReasonEn) || trimmedOrNull(user.rejectionReason),
      rejectionReasonAr: trimmedOrNull(latest?.rejectionReasonAr) || trimmedOrNull(user.rejectionReasonAr) || trimmedOrNull(user.rejectionReason),
    });
  } catch (error) {
    console.error("Fetch rejection reason failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.put("/api/volunteer/reapply", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.body.userId)) {
      return res.status(400).json({ errorCode: "INVALID_USER_ID" });
    }

    const user = await User.findById(req.body.userId);
    if (!user) return res.status(404).json({ errorCode: "USER_NOT_FOUND" });
    if (user.accountStatus === "blocked") {
      return res.status(403).json({ errorCode: "ACCOUNT_BLOCKED" });
    }
    if (!user.isEmailVerified) {
      return res.status(403).json({ errorCode: "EMAIL_NOT_VERIFIED" });
    }
    if (user.volunteerStatus === "pending") {
      return res.status(409).json({ errorCode: "VOLUNTEER_APPLICATION_ALREADY_PENDING" });
    }
    if (user.role !== "user" || user.volunteerStatus !== "rejected") {
      return res.status(409).json({ errorCode: "VOLUNTEER_APPLICATION_NOT_REJECTED" });
    }

    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    if (!PHONE_PATTERN.test(phone)) {
      return res.status(400).json({ errorCode: "INVALID_PHONE" });
    }

    const skillResult = await readVolunteerSkills(req.body.skills, user.skills);
    if (skillResult.errorCode) {
      return res.status(400).json({ errorCode: skillResult.errorCode });
    }

    const birthDate = parseProfileBirthDate(req.body.dateOfBirth);
    const today = new Date();
    const todayValue = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    if (!birthDate) return res.status(400).json({ errorCode: "INVALID_DATE_OF_BIRTH" });
    const birthValue = birthDate.year * 10000 + birthDate.month * 100 + birthDate.day;
    if (birthValue < 19000101 || birthValue > todayValue) {
      return res.status(400).json({ errorCode: "INVALID_DATE_OF_BIRTH" });
    }
    if (!isAdultBirthDate(birthDate.year, birthDate.month, birthDate.day)) {
      return res.status(400).json({ errorCode: "DATE_OF_BIRTH_UNDERAGE" });
    }

    ensureApplicationHistory(user);
    if (!Array.isArray(user.applicationHistory)) user.applicationHistory = [];
    user.applicationHistory.push({
      applicationNumber: nextApplicationNumber(user),
      submittedAt: new Date(),
      status: "pending",
      rejectionReason: null,
      rejectionReasonEn: null,
      rejectionReasonAr: null,
      decidedAt: null,
      reviewedBy: null,
      phone,
      skill: skillResult.skills,
      dateOfBirth: birthDate.utcDate,
    });

    const updated = await User.findOneAndUpdate(
      {
        _id: user._id,
        role: "user",
        volunteerStatus: "rejected",
        accountStatus: { $ne: "blocked" },
        isEmailVerified: true,
      },
      {
        $set: {
          phone,
          skills: skillResult.skills,
          dateOfBirth: birthDate.utcDate,
          volunteerStatus: "pending",
          rejectionReason: null,
          rejectionReasonEn: null,
          rejectionReasonAr: null,
          applicationHistory: historySnapshot(user.applicationHistory),
        },
      },
      { new: true },
    );
    if (!updated) {
      return res.status(409).json({ errorCode: "VOLUNTEER_APPLICATION_ALREADY_PENDING" });
    }

    await recordActivity({
      type: "volunteer_application_submitted",
      userId: updated._id,
    });
    const admins = await User.find({
      role: "admin",
      accountStatus: { $ne: "blocked" },
    }).select("_id").lean();
    await createNotifications(admins.map((admin) => ({
      userId: admin._id,
      type: "volunteer_application_submitted",
    })));

    return res.status(200).json({
      messageCode: "VOLUNTEER_REAPPLICATION_SUBMITTED",
      message: {
        en: "Your volunteer application was submitted again and is pending review.",
        ar: "أُعيد إرسال طلب التطوع وهو بانتظار المراجعة.",
      },
      user: toSessionUser(updated),
    });
  } catch (error) {
    console.error("Volunteer reapplication failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

const SERVICE_NAME_MIN = 2;
const SERVICE_NAME_MAX = 60;
const SERVICE_DESCRIPTION_MIN = 5;
const SERVICE_DESCRIPTION_MAX = 400;

const toPublicService = (service) => ({
  id: service._id.toString(),
  name: service.name,
  nameAr: typeof service.nameAr === "string" ? service.nameAr : "",
  description: service.description,
  descriptionAr: typeof service.descriptionAr === "string" ? service.descriptionAr : "",
  category: categoryIdValue(service.categoryId) || null,
  isVisible: service.isVisible,
  createdAt: service.createdAt,
  updatedAt: service.updatedAt,
});

const readServiceText = (value, minLength, maxLength) => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length < minLength || text.length > maxLength) return null;
  return text;
};

const readOptionalServiceText = (body, key, current, minLength, maxLength, errorCode) => {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return { value: typeof current === "string" ? current : "" };
  }
  if (body[key] == null || (typeof body[key] === "string" && body[key].trim() === "")) {
    return { value: "" };
  }
  const text = readServiceText(body[key], minLength, maxLength);
  if (!text) return { errorCode };
  return { value: text };
};

const readServiceCategory = async (body, current) => {
  const provided = Object.prototype.hasOwnProperty.call(body, "category");
  const preserved = categoryIdValue(current);
  if (!provided) return { categoryId: preserved || null };
  if (body.category == null || (typeof body.category === "string" && body.category.trim() === "")) {
    return { categoryId: null };
  }
  const categoryId = categoryIdValue(body.category);
  if (!categoryId) return { errorCode: "INVALID_CATEGORY_ID" };
  if (preserved && categoryId === preserved) return { categoryId };
  await refreshKnownCategories();
  if (!activeCategoryIds().has(categoryId)) return { errorCode: "INVALID_CATEGORY_ID" };
  return { categoryId };
};

app.post("/api/admin/services", async (req, res) => {
  try {
    const name = readServiceText(
      req.body.name,
      SERVICE_NAME_MIN,
      SERVICE_NAME_MAX,
    );
    const description = readServiceText(
      req.body.description,
      SERVICE_DESCRIPTION_MIN,
      SERVICE_DESCRIPTION_MAX,
    );

    if (!name) {
      return res.status(400).json({
        errorCode: "INVALID_SERVICE_NAME",
      });
    }

    if (!description) {
      return res.status(400).json({
        errorCode: "INVALID_SERVICE_DESCRIPTION",
      });
    }

    const nameArResult = readOptionalServiceText(
      req.body,
      "nameAr",
      "",
      SERVICE_NAME_MIN,
      SERVICE_NAME_MAX,
      "INVALID_SERVICE_NAME",
    );
    if (nameArResult.errorCode) {
      return res.status(400).json({ errorCode: nameArResult.errorCode });
    }
    const descriptionArResult = readOptionalServiceText(
      req.body,
      "descriptionAr",
      "",
      SERVICE_DESCRIPTION_MIN,
      SERVICE_DESCRIPTION_MAX,
      "INVALID_SERVICE_DESCRIPTION",
    );
    if (descriptionArResult.errorCode) {
      return res.status(400).json({ errorCode: descriptionArResult.errorCode });
    }
    const categoryResult = await readServiceCategory(req.body, null);
    if (categoryResult.errorCode) {
      return res.status(400).json({ errorCode: categoryResult.errorCode });
    }

    const service = await Service.create({
      name,
      nameAr: nameArResult.value,
      description,
      descriptionAr: descriptionArResult.value,
      categoryId: categoryResult.categoryId,
      isVisible: true,
    });

    await recordActivity({ type: "service_created" });

    return res.status(201).json({
      messageCode: "SERVICE_CREATED",
      service: toPublicService(service),
    });
  } catch (error) {
    console.error("Create service failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.get("/api/admin/services", async (_req, res) => {
  try {
    const services = await Service.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      services: services.map(toPublicService),
    });
  } catch (error) {
    console.error("Fetch services failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.put("/api/admin/services/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        errorCode: "INVALID_SERVICE_ID",
      });
    }

    const name = readServiceText(
      req.body.name,
      SERVICE_NAME_MIN,
      SERVICE_NAME_MAX,
    );
    const description = readServiceText(
      req.body.description,
      SERVICE_DESCRIPTION_MIN,
      SERVICE_DESCRIPTION_MAX,
    );

    if (!name) {
      return res.status(400).json({
        errorCode: "INVALID_SERVICE_NAME",
      });
    }

    if (!description) {
      return res.status(400).json({
        errorCode: "INVALID_SERVICE_DESCRIPTION",
      });
    }

    if (typeof req.body.isVisible !== "boolean") {
      return res.status(400).json({
        errorCode: "INVALID_SERVICE_VISIBILITY",
      });
    }

    const service = await Service.findById(id);

    if (!service) {
      return res.status(404).json({
        errorCode: "SERVICE_NOT_FOUND",
      });
    }

    const nameArResult = readOptionalServiceText(
      req.body,
      "nameAr",
      service.nameAr,
      SERVICE_NAME_MIN,
      SERVICE_NAME_MAX,
      "INVALID_SERVICE_NAME",
    );
    if (nameArResult.errorCode) {
      return res.status(400).json({ errorCode: nameArResult.errorCode });
    }
    const descriptionArResult = readOptionalServiceText(
      req.body,
      "descriptionAr",
      service.descriptionAr,
      SERVICE_DESCRIPTION_MIN,
      SERVICE_DESCRIPTION_MAX,
      "INVALID_SERVICE_DESCRIPTION",
    );
    if (descriptionArResult.errorCode) {
      return res.status(400).json({ errorCode: descriptionArResult.errorCode });
    }
    const categoryResult = await readServiceCategory(req.body, service.categoryId);
    if (categoryResult.errorCode) {
      return res.status(400).json({ errorCode: categoryResult.errorCode });
    }

    const nameArProvided = Object.prototype.hasOwnProperty.call(req.body, "nameAr");
    const descriptionArProvided = Object.prototype.hasOwnProperty.call(req.body, "descriptionAr");
    const categoryProvided = Object.prototype.hasOwnProperty.call(req.body, "category");
    const visibilityChanged = service.isVisible !== req.body.isVisible;
    const contentChanged =
      service.name !== name ||
      service.description !== description ||
      (nameArProvided && (service.nameAr || "") !== nameArResult.value) ||
      (descriptionArProvided && (service.descriptionAr || "") !== descriptionArResult.value) ||
      (categoryProvided && (categoryIdValue(service.categoryId) || null) !== categoryResult.categoryId);

    const previousCategory = categoryIdValue(service.categoryId) || null;
    service.name = name;
    if (Object.prototype.hasOwnProperty.call(req.body, "nameAr")) service.nameAr = nameArResult.value;
    service.description = description;
    if (Object.prototype.hasOwnProperty.call(req.body, "descriptionAr")) {
      service.descriptionAr = descriptionArResult.value;
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
      service.categoryId = categoryResult.categoryId;
    }
    service.isVisible = req.body.isVisible;
    await service.save();
    const nextCategory = categoryIdValue(service.categoryId) || null;
    if (previousCategory !== nextCategory) {
      await recoverOpenBoardForService(service._id);
    }

    if (contentChanged) {
      await recordActivity({ type: "service_updated" });
    } else if (visibilityChanged) {
      await recordActivity({ type: "service_visibility_changed" });
    }

    return res.status(200).json({
      messageCode: "SERVICE_UPDATED",
      service: toPublicService(service),
    });
  } catch (error) {
    console.error("Update service failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.delete("/api/admin/services/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        errorCode: "INVALID_SERVICE_ID",
      });
    }

    const service = await Service.findByIdAndDelete(id);

    if (!service) {
      return res.status(404).json({
        errorCode: "SERVICE_NOT_FOUND",
      });
    }

    await recordActivity({ type: "service_deleted" });

    return res.status(200).json({
      messageCode: "SERVICE_DELETED",
    });
  } catch (error) {
    console.error("Delete service failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

const CATEGORY_NAME_MIN = 2;
const CATEGORY_NAME_MAX = 40;

const readCategoryName = (value) => {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (text.length < CATEGORY_NAME_MIN || text.length > CATEGORY_NAME_MAX) return "";
  return text;
};

const categoryReferences = (usage, categoryId) => ({
  services: usage.services.get(categoryId) || 0,
  volunteers: usage.volunteers.get(categoryId) || 0,
  requests: usage.helpRequests.get(categoryId) || 0,
  history: usage.history.get(categoryId) || 0,
});

app.get("/api/categories", async (_req, res) => {
  try {
    const categories = await Category.find().sort({ categoryNumber: 1 }).lean();
    await refreshKnownCategories();
    return res.status(200).json({
      categories: categories.map(toPublicCategory),
    });
  } catch (error) {
    console.error("Fetch categories failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/admin/categories", async (_req, res) => {
  try {
    const [categories, usage] = await Promise.all([
      Category.find().sort({ categoryNumber: 1 }).lean(),
      categoryUsageCounts(),
    ]);
    await refreshKnownCategories();
    return res.status(200).json({
      categories: categories.map((category) => toAdminCategory(category, usage)),
    });
  } catch (error) {
    console.error("Fetch admin categories failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.post("/api/admin/categories", async (req, res) => {
  try {
    const nameEn = readCategoryName(req.body.nameEn);
    const nameAr = readCategoryName(req.body.nameAr);
    if (!nameEn || !nameAr) {
      return res.status(400).json({ errorCode: "INVALID_CATEGORY_NAME" });
    }

    await ensureObsoleteCategorySlugIndexRemoved();
    const categoryNumber = await allocateCounter("category");
    const category = await Category.create({
      categoryNumber,
      name: { en: nameEn, ar: nameAr },
      isActive: true,
    });
    await recordActivity({ type: "category_created" });
    await refreshKnownCategories();
    return res.status(201).json({
      messageCode: "CATEGORY_CREATED",
      category: toPublicCategory(category),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ errorCode: "CATEGORY_EXISTS" });
    }
    console.error("Create category failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.put("/api/admin/categories/:id", async (req, res) => {
  try {
    const categoryId = categoryIdValue(req.params.id);
    const nameEn = readCategoryName(req.body.nameEn);
    const nameAr = readCategoryName(req.body.nameAr);
    if (!categoryId) return res.status(400).json({ errorCode: "INVALID_CATEGORY_ID" });
    if (!nameEn || !nameAr) {
      return res.status(400).json({ errorCode: "INVALID_CATEGORY_NAME" });
    }

    const category = await Category.findOne({ categoryNumber: Number(categoryId) });
    if (!category) return res.status(404).json({ errorCode: "CATEGORY_NOT_FOUND" });
    const nameChanged = category.name?.en !== nameEn || category.name?.ar !== nameAr;
    if (nameChanged) {
      category.name = { en: nameEn, ar: nameAr };
      category.markModified("name");
      await category.save();
      await recordActivity({ type: "category_updated" });
    }
    await refreshKnownCategories();
    return res.status(200).json({
      messageCode: "CATEGORY_UPDATED",
      category: toPublicCategory(category),
    });
  } catch (error) {
    console.error("Update category failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.put("/api/admin/categories/:id/status", async (req, res) => {
  try {
    const categoryId = categoryIdValue(req.params.id);
    if (!categoryId) return res.status(400).json({ errorCode: "INVALID_CATEGORY_ID" });
    if (typeof req.body.isActive !== "boolean") {
      return res.status(400).json({ errorCode: "INVALID_CATEGORY_STATUS" });
    }

    const category = await Category.findOneAndUpdate(
      { categoryNumber: Number(categoryId), isActive: { $ne: req.body.isActive } },
      { $set: { isActive: req.body.isActive } },
      { new: true },
    );
    if (!category) {
      const current = await Category.findOne({ categoryNumber: Number(categoryId) });
      if (!current) return res.status(404).json({ errorCode: "CATEGORY_NOT_FOUND" });
      return res.status(200).json({
        messageCode: req.body.isActive ? "CATEGORY_ACTIVATED" : "CATEGORY_DEACTIVATED",
        category: toPublicCategory(current),
      });
    }
    await recordActivity({
      type: req.body.isActive ? "category_activated" : "category_deactivated",
    });
    await refreshKnownCategories();
    if (req.body.isActive) {
      const services = await Service.find({ categoryId }).select("_id categoryId").lean();
      for (const service of services) {
        if (categoryIdValue(service.categoryId) !== categoryId) continue;
        await recoverOpenBoardForService(service._id);
      }
    }
    return res.status(200).json({
      messageCode: req.body.isActive ? "CATEGORY_ACTIVATED" : "CATEGORY_DEACTIVATED",
      category: toPublicCategory(category),
    });
  } catch (error) {
    console.error("Update category status failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.delete("/api/admin/categories/:id", async (req, res) => {
  try {
    const categoryId = categoryIdValue(req.params.id);
    if (!categoryId) return res.status(400).json({ errorCode: "INVALID_CATEGORY_ID" });

    const category = await Category.findOne({ categoryNumber: Number(categoryId) });
    if (!category) return res.status(404).json({ errorCode: "CATEGORY_NOT_FOUND" });

    const usage = await categoryUsageCounts();
    const references = categoryReferences(usage, categoryId);
    if (references.services || references.volunteers || references.requests || references.history) {
      return res.status(409).json({ errorCode: "CATEGORY_IN_USE", usage: references });
    }

    const removed = await Category.deleteOne({ _id: category._id });
    if (!removed.deletedCount) {
      return res.status(404).json({ errorCode: "CATEGORY_NOT_FOUND" });
    }
    await recordActivity({ type: "category_deleted" });
    await refreshKnownCategories();
    return res.status(200).json({ messageCode: "CATEGORY_DELETED" });
  } catch (error) {
    console.error("Delete category failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/admin/volunteers", async (_req, res) => {
  try {
    const volunteers = await User.find({
      role: "volunteer",
      volunteerStatus: "approved",
    })
      .select("fullName email phone skills dateOfBirth createdAt accountStatus")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      volunteers: volunteers.map(({ _id, accountStatus, ...volunteer }) => ({
        id: _id.toString(),
        ...volunteer,
        skills: storedVolunteerSkills(volunteer.skills),
        accountStatus: accountStatus === "blocked" ? "blocked" : "active",
      })),
    });
  } catch (error) {
    console.error("Fetch approved volunteers failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

const FULL_NAME_PATTERN = /^(?=.{6,30}$)[A-Za-z]{3,}(?:\s+[A-Za-z]{3,})+$/;
const EMAIL_PATTERN = /^[A-Za-z0-9._-]+@gmail\.com$/;
const PHONE_PATTERN = /^[79][0-9]{7}$/;
const COORDINATE_PATTERN = /^-?\d+(?:\.\d+)?$/;

const readCoordinate = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !COORDINATE_PATTERN.test(value.trim())) return null;
  const coordinate = Number(value.trim());
  return Number.isFinite(coordinate) ? coordinate : null;
};

const readRating = (value) => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) return value;
  if (typeof value === "string" && /^[1-5]$/.test(value)) return Number(value);
  return null;
};

const skillSource = (value) => (
  Array.isArray(value) ? value : typeof value === "string" && value ? [value] : []
);

const storedVolunteerSkills = (value) => {
  const skills = [];

  for (const item of skillSource(value)) {
    if (typeof item !== "string") continue;
    const skill = item.trim();
    if (!skill || skills.includes(skill)) continue;
    skills.push(skill);
  }

  return skills;
};

const matchingCategoryIds = (value) => {
  const source = Array.isArray(value)
    ? value
    : value == null || value === ""
      ? []
      : [value];
  const ids = [];
  for (const item of source) {
    const id = categoryIdValue(item);
    if (!id || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
};

const volunteerSkillKey = (value) => matchingCategoryIds(value).slice().sort().join("\0");

const readVolunteerSkills = async (value) => {
  const submitted = storedVolunteerSkills(value);
  await refreshKnownCategories();
  const active = activeCategoryIds();
  const selected = [];

  for (const item of submitted) {
    const id = categoryIdValue(item);
    if (!id || !active.has(id)) return { errorCode: "INVALID_SKILLS" };
    if (!selected.includes(id)) selected.push(id);
  }

  if (!selected.length) return { errorCode: "INVALID_SKILLS" };
  return { skills: selected };
};

const APPLICATION_HISTORY_STATUSES = ["pending", "approved", "rejected"];
const REJECTION_REASON_MAX = 1000;

const trimmedOrNull = (value) => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text || null;
};

const readReviewerId = (value) => (
  mongoose.isValidObjectId(value) ? value : null
);

const ensureApplicationHistory = (user) => {
  if (!user || user.role === "admin") return false;
  if (Array.isArray(user.applicationHistory) && user.applicationHistory.length > 0) {
    return false;
  }
  if (!APPLICATION_HISTORY_STATUSES.includes(user.volunteerStatus)) return false;

  const createdAt = user.createdAt;
  const submittedAt =
    createdAt instanceof Date && !Number.isNaN(createdAt.getTime())
      ? createdAt
      : new Date();

  user.applicationHistory = [
    {
      applicationNumber: 1,
      submittedAt,
      status: user.volunteerStatus,
      rejectionReason: trimmedOrNull(user.rejectionReasonEn) || trimmedOrNull(user.rejectionReason),
      rejectionReasonEn: trimmedOrNull(user.rejectionReasonEn) || trimmedOrNull(user.rejectionReason),
      rejectionReasonAr: trimmedOrNull(user.rejectionReasonAr) || trimmedOrNull(user.rejectionReason),
      decidedAt: user.volunteerStatus === "pending" ? null : user.updatedAt || null,
      reviewedBy: null,
      phone: user.phone || null,
      skill: storedVolunteerSkills(user.skills),
      dateOfBirth: user.dateOfBirth || null,
    },
  ];
  return true;
};

const currentPendingApplication = (user) => {
  const history = Array.isArray(user.applicationHistory) ? user.applicationHistory : [];
  return history.reduce((current, entry) => {
    if (entry?.status !== "pending") return current;
    if (!current || entry.applicationNumber >= current.applicationNumber) return entry;
    return current;
  }, null);
};

const latestHistoryEntry = (user, status) => {
  const history = Array.isArray(user.applicationHistory) ? user.applicationHistory : [];
  return history.reduce((current, entry) => {
    if (status && entry?.status !== status) return current;
    const number = Number(entry?.applicationNumber);
    const currentNumber = Number(current?.applicationNumber);
    if (!current || (Number.isInteger(number) && number >= currentNumber)) return entry;
    return current;
  }, null);
};

const restorePendingApplication = (entry) => {
  entry.status = "pending";
  entry.rejectionReason = null;
  entry.rejectionReasonEn = null;
  entry.rejectionReasonAr = null;
  entry.decidedAt = null;
  entry.reviewedBy = null;
};

const toPublicHistoryEntry = (entry) => ({
  applicationNumber: Number.isInteger(entry?.applicationNumber) ? entry.applicationNumber : null,
  submittedAt: entry?.submittedAt || null,
  status: entry?.status || null,
  rejectionReason: trimmedOrNull(entry?.rejectionReason),
  rejectionReasonEn: trimmedOrNull(entry?.rejectionReasonEn),
  rejectionReasonAr: trimmedOrNull(entry?.rejectionReasonAr),
  decidedAt: entry?.decidedAt || null,
  phone: entry?.phone || null,
  skill: storedVolunteerSkills(entry?.skill),
  dateOfBirth: entry?.dateOfBirth || null,
});

const sortHistory = (history) => [...history].sort((left, right) => {
  const leftNumber = left.applicationNumber || 0;
  const rightNumber = right.applicationNumber || 0;
  if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  return new Date(left.submittedAt || 0) - new Date(right.submittedAt || 0);
});

const nextApplicationNumber = (user) => {
  const history = Array.isArray(user.applicationHistory) ? user.applicationHistory : [];
  return history.reduce((max, entry) => {
    const number = Number(entry?.applicationNumber);
    return Number.isInteger(number) && number > max ? number : max;
  }, 0) + 1;
};

const historySnapshot = (history) => (
  typeof history?.toObject === "function" ? history.toObject() : history
);

const toSessionUser = (user) => ({
  id: user._id.toString(),
  fullName: user.fullName,
  email: user.email,
  profileImage: user.profileImage,
  role: user.role,
  phone: user.phone,
  skills: storedVolunteerSkills(user.skills),
  dateOfBirth: user.dateOfBirth,
  isEmailVerified: user.isEmailVerified,
  volunteerStatus: user.volunteerStatus,
});

const parseProfileBirthDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, utcDate };
};

const isAdultBirthDate = (year, month, day) => {
  const today = new Date();
  let age = today.getFullYear() - year;
  const monthDifference = today.getMonth() + 1 - month;

  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < day)) {
    age -= 1;
  }

  return age >= 18;
};

const toPublicVolunteer = (user) => ({
  id: user._id.toString(),
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  skills: storedVolunteerSkills(user.skills),
  dateOfBirth: user.dateOfBirth,
  createdAt: user.createdAt,
});

const findApprovedVolunteer = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    return { errorCode: "INVALID_VOLUNTEER_ID", status: 400 };
  }

  const user = await User.findById(id);

  if (!user) {
    return { errorCode: "VOLUNTEER_NOT_FOUND", status: 404 };
  }

  if (user.role !== "volunteer" || user.volunteerStatus !== "approved") {
    return { errorCode: "VOLUNTEER_NOT_APPROVED", status: 409 };
  }

  return { user };
};

app.put("/api/admin/volunteers/:id/profile", async (req, res) => {
  try {
    const lookup = await findApprovedVolunteer(req.params.id);

    if (!lookup.user) {
      return res.status(lookup.status).json({
        errorCode: lookup.errorCode,
      });
    }

    const user = lookup.user;
    const fullName =
      typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() : "";

    if (!FULL_NAME_PATTERN.test(fullName)) {
      return res.status(400).json({
        errorCode: "INVALID_FULL_NAME",
      });
    }

    if (!PHONE_PATTERN.test(phone)) {
      return res.status(400).json({
        errorCode: "INVALID_PHONE",
      });
    }

    const skillResult = await readVolunteerSkills(req.body.skills, user.skills);
    if (skillResult.errorCode) {
      return res.status(400).json({ errorCode: skillResult.errorCode });
    }

    const birthDate = parseProfileBirthDate(req.body.dateOfBirth);
    const today = new Date();
    const todayValue =
      today.getFullYear() * 10000 +
      (today.getMonth() + 1) * 100 +
      today.getDate();

    if (!birthDate) {
      return res.status(400).json({
        errorCode: "INVALID_DATE_OF_BIRTH",
      });
    }

    const birthValue =
      birthDate.year * 10000 + birthDate.month * 100 + birthDate.day;

    if (birthValue < 19000101 || birthValue > todayValue) {
      return res.status(400).json({
        errorCode: "INVALID_DATE_OF_BIRTH",
      });
    }

    if (!isAdultBirthDate(birthDate.year, birthDate.month, birthDate.day)) {
      return res.status(400).json({
        errorCode: "DATE_OF_BIRTH_UNDERAGE",
      });
    }

    const previousSkills = volunteerSkillKey(user.skills);
    user.fullName = fullName;
    user.phone = phone;
    user.skills = skillResult.skills;
    user.dateOfBirth = birthDate.utcDate;
    await user.save();
    if (volunteerSkillKey(user.skills) !== previousSkills) {
      await recoverOpenBoardForVolunteer(user);
    }

    return res.status(200).json({
      messageCode: "VOLUNTEER_UPDATED",
      volunteer: toPublicVolunteer(user),
    });
  } catch (error) {
    console.error("Update volunteer profile failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.put("/api/admin/volunteers/:id/status", async (req, res) => {
  try {
    const lookup = await findApprovedVolunteer(req.params.id);

    if (!lookup.user) {
      return res.status(lookup.status).json({
        errorCode: lookup.errorCode,
      });
    }

    const user = lookup.user;
    ensureApplicationHistory(user);
    const approvedEntry = latestHistoryEntry(user, "approved");
    if (approvedEntry) {
      approvedEntry.status = "revoked";
      approvedEntry.decidedAt = new Date();
      approvedEntry.reviewedBy = readReviewerId(req.body.adminId);
    }
    const updated = await User.findOneAndUpdate(
      { _id: user._id, role: "volunteer", volunteerStatus: "approved" },
      {
        $set: {
          role: "user",
          volunteerStatus: "not-applicable",
          applicationHistory: historySnapshot(user.applicationHistory),
        },
      },
      { new: true },
    );
    if (!updated) {
      return res.status(409).json({ errorCode: "VOLUNTEER_ALREADY_UPDATED" });
    }

    await recordActivity({ type: "volunteer_access_revoked" });
    await createNotifications({
      userId: user._id,
      type: "volunteer_application_revoked",
    });

    return res.status(200).json({
      messageCode: "VOLUNTEER_DEACTIVATED",
    });
  } catch (error) {
    console.error("Deactivate volunteer failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

app.put("/api/users/:id/profile", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        errorCode: "INVALID_USER_ID",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
      });
    }

    if (user.accountStatus === "blocked") {
      return res.status(403).json({
        errorCode: "ACCOUNT_BLOCKED",
      });
    }

    const fullName =
      typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";
    const phone =
      typeof req.body.phone === "string" ? req.body.phone.trim() : "";

    if (!FULL_NAME_PATTERN.test(fullName)) {
      return res.status(400).json({
        errorCode: "INVALID_FULL_NAME",
      });
    }

    if (user.role !== "admin" && !PHONE_PATTERN.test(phone)) {
      return res.status(400).json({
        errorCode: "INVALID_PHONE",
      });
    }

    let skills;
    let dateOfBirth;

    if (user.role === "volunteer") {
      const skillResult = await readVolunteerSkills(req.body.skills, user.skills);
      if (skillResult.errorCode) {
        return res.status(400).json({ errorCode: skillResult.errorCode });
      }
      skills = skillResult.skills;

      const birthDate = parseProfileBirthDate(req.body.dateOfBirth);
      const today = new Date();
      const todayValue =
        today.getFullYear() * 10000 +
        (today.getMonth() + 1) * 100 +
        today.getDate();

      if (!birthDate) {
        return res.status(400).json({
          errorCode: "INVALID_DATE_OF_BIRTH",
        });
      }

      const birthValue =
        birthDate.year * 10000 + birthDate.month * 100 + birthDate.day;

      if (birthValue < 19000101 || birthValue > todayValue) {
        return res.status(400).json({
          errorCode: "INVALID_DATE_OF_BIRTH",
        });
      }

      if (!isAdultBirthDate(birthDate.year, birthDate.month, birthDate.day)) {
        return res.status(400).json({
          errorCode: "DATE_OF_BIRTH_UNDERAGE",
        });
      }

      dateOfBirth = birthDate.utcDate;
    }

    user.fullName = fullName;

    if (user.role !== "admin") {
      user.phone = phone;
    }

    const previousSkills = user.role === "volunteer" ? volunteerSkillKey(user.skills) : "";
    if (user.role === "volunteer") {
      user.skills = skills;
      user.dateOfBirth = dateOfBirth;
    }

    await user.save();
    if (user.role === "volunteer" && volunteerSkillKey(user.skills) !== previousSkills) {
      await recoverOpenBoardForVolunteer(user);
    }

    return res.status(200).json({
      messageCode: "PROFILE_UPDATED",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        profileImage: user.profileImage,
        role: user.role,
        phone: user.phone,
        skills: storedVolunteerSkills(user.skills),
        dateOfBirth: user.dateOfBirth,
        isEmailVerified: user.isEmailVerified,
        volunteerStatus: user.volunteerStatus,
      },
    });
  } catch (error) {
    console.error("Update profile failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

const isValidPassword = (value) =>
  typeof value === "string" &&
  value.length >= 8 &&
  value.length <= 12 &&
  /[A-Z]/.test(value) &&
  /[a-z]/.test(value) &&
  /[0-9]/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

app.put("/api/users/:id/password", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        errorCode: "INVALID_USER_ID",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        errorCode: "USER_NOT_FOUND",
      });
    }

    if (user.accountStatus === "blocked") {
      return res.status(403).json({
        errorCode: "ACCOUNT_BLOCKED",
      });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (typeof currentPassword !== "string" || currentPassword.length === 0) {
      return res.status(400).json({
        errorCode: "CURRENT_PASSWORD_REQUIRED",
      });
    }

    if (typeof newPassword !== "string" || newPassword.length === 0) {
      return res.status(400).json({
        errorCode: "NEW_PASSWORD_REQUIRED",
      });
    }

    if (typeof confirmPassword !== "string" || confirmPassword.length === 0) {
      return res.status(400).json({
        errorCode: "CONFIRM_PASSWORD_REQUIRED",
      });
    }

    const isCurrentPasswordCorrect = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isCurrentPasswordCorrect) {
      return res.status(401).json({
        errorCode: "INVALID_CURRENT_PASSWORD",
      });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        errorCode: "INVALID_NEW_PASSWORD",
      });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({
        errorCode: "PASSWORD_UNCHANGED",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        errorCode: "PASSWORD_MISMATCH",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({
      messageCode: "PASSWORD_CHANGED",
    });
  } catch (error) {
    console.error("Change password failed:", error);

    return res.status(500).json({
      errorCode: "SERVER_ERROR",
    });
  }
});

const WILAYAT_ALIASES = {
  muscat: ["muscat", "مسقط"],
  muttrah: ["muttrah", "mutrah", "matrah", "مطرح"],
  bawshar: ["bawshar", "bausher", "bowshar", "bosher", "بوشر"],
  seeb: ["seeb", "as seeb", "as-seeb", "al seeb", "al-seeb", "as sib", "السيب"],
  amarat: ["al amarat", "al-amarat", "amarat", "al amerat", "العامرات"],
  qurayyat: ["qurayyat", "quriyat", "قريات"],
};

const readBoundedText = (value, minimum, maximum) => {
  if (value == null || value === "") return "";
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length > maximum) return null;
  if (text.length > 0 && text.length < minimum) return null;
  return text;
};

const readConfirmedAddress = (body) => {
  if (body.governorate != null && body.governorate !== "muscat") return null;
  if (!MUSCAT_WILAYATS.includes(body.wilayat)) return null;
  if (body.locationConfirmed !== true) return null;

  const area = readBoundedText(body.area, 2, 80);
  const street = readBoundedText(body.street, 2, 80);
  const building = readBoundedText(body.building, 1, 40);
  const landmark = readBoundedText(body.landmark, 8, 200);
  if (area == null || street == null || building == null || landmark == null) return null;
  if (area.length < 2) return null;

  const hasLandmark = landmark.length >= 8;
  if (!((street.length >= 2 && building.length >= 1) || hasLandmark)) return null;

  return {
    governorate: "muscat",
    wilayat: body.wilayat,
    area,
    street,
    building,
    landmark,
  };
};

const matchWilayat = (value) => {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/^wilayat\s+/i, "")
    .replace(/^ولاية\s+/, "")
    .replace(/\s+(province|governorate|wilayat|district)$/i, "")
    .trim();
  if (!normalized) return "";

  return (
    Object.entries(WILAYAT_ALIASES).find(([, names]) =>
      names.some((name) => normalized === name || normalized.endsWith(` ${name}`)),
    )?.[0] || ""
  );
};

const emptyGeocode = () => ({
  geocodeAvailable: false,
  detectedAddress: "",
  governorate: "muscat",
  wilayat: "",
  area: "",
  street: "",
  building: "",
});

const mapGeocode = (body) => {
  const address = body?.address || {};
  const wilayat = ["county", "state_district", "city", "town"]
    .map((key) => matchWilayat(address[key]))
    .find(Boolean) || "";

  return {
    geocodeAvailable: true,
    detectedAddress: typeof body?.display_name === "string" ? body.display_name : "",
    governorate: "muscat",
    wilayat,
    area: address.suburb || address.neighbourhood || address.quarter || address.city_district || address.village || "",
    street: address.road || address.pedestrian || "",
    building: address.house_number || "",
  };
};

const geocodeCache = new Map();
let geocodeChain = Promise.resolve();
let lastGeocodeAt = 0;

const reverseGeocode = (latitude, longitude) => {
  const key = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
  if (geocodeCache.has(key)) return Promise.resolve(geocodeCache.get(key));

  const run = geocodeChain.then(async () => {
    const wait = 1100 - (Date.now() - lastGeocodeAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastGeocodeAt = Date.now();

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en,ar",
        "User-Agent": "HelpNearbySystem/1.0 (local help-request map)",
      },
    });
    if (!response.ok) {
      throw new Error(`Reverse geocoding returned ${response.status}`);
    }

    const mapped = mapGeocode(await response.json());
    geocodeCache.set(key, mapped);
    return mapped;
  });

  geocodeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

const readDescription = (value) => {
  if (value == null || value === "") return "";
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length > 400 || (text.length > 0 && text.length < 5)) return null;
  return text;
};

const findAccount = async (id, options = {}) => {
  if (!mongoose.isValidObjectId(id)) {
    return { errorCode: "INVALID_USER_ID", status: 400 };
  }

  const user = await User.findById(id);
  if (!user) return { errorCode: "USER_NOT_FOUND", status: 404 };
  if (!options.allowBlocked && user.accountStatus === "blocked") {
    return { errorCode: "ACCOUNT_BLOCKED", status: 403 };
  }
  return { user };
};

const findActiveAdmin = async (id) => {
  const lookup = await findAccount(id);
  if (!lookup.user) return lookup;
  if (lookup.user.role !== "admin") {
    return { errorCode: "NOT_ALLOWED", status: 403 };
  }
  return lookup;
};

const accountStatusValue = (user) =>
  user?.accountStatus === "blocked" ? "blocked" : "active";

const HELP_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "in-progress",
  "completed",
  "rejected",
  "cancelled",
];

const sendAccountStatusEmail = async (user, blocked) => {
  const emailContent = blocked ? accountBlockedEmail("en") : accountUnblockedEmail("en");
  try {
    await transporter.sendMail({
      from: '"HelpNearby" <tre3lc@gmail.com>',
      to: user.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });
    return true;
  } catch {
    console.error("Account status email failed.");
    return false;
  }
};

const disconnectBlockedAccount = (userId) => {
  emitToUserSockets(userId, "account_blocked");
  setTimeout(() => {
    io.in(notificationRoom(userId)).disconnectSockets(true);
    const sockets = socketsByUser.get(String(userId));
    if (!sockets) return;
    for (const socket of [...sockets]) socket.disconnect(true);
  }, 1000);
};

const isNormalUser = (user) =>
  user.role === "user" &&
  user.volunteerStatus === "not-applicable" &&
  user.isEmailVerified;

const isApprovedVolunteer = (user) =>
  user.role === "volunteer" && user.volunteerStatus === "approved";

const serviceRefId = (service) => {
  if (!service) return "";
  if (service._id) return service._id.toString();
  return service.toString();
};

const requestServiceIds = (request) => {
  const listed = Array.isArray(request.serviceIds) ? request.serviceIds : [];
  const ids = listed.map(serviceRefId).filter(Boolean);
  if (ids.length > 0) return ids;
  const primary = serviceRefId(request.serviceId);
  return primary ? [primary] : [];
};

const serviceLabelText = (service, field) => {
  if (!service || typeof service !== "object") return "";
  const preferred = typeof service[field] === "string" ? service[field].trim() : "";
  if (preferred) return preferred;
  if (field === "nameAr") return typeof service.name === "string" ? service.name.trim() : "";
  return "";
};

const requestServiceText = (request, field) => {
  const listed = Array.isArray(request.serviceIds)
    ? request.serviceIds.map((service) => serviceLabelText(service, field)).filter(Boolean)
    : [];
  if (listed.length > 0) return listed.join(", ");
  return serviceLabelText(request.serviceId, field);
};

const requestServiceName = (request) => requestServiceText(request, "name");

const requestServiceNameAr = (request) => requestServiceText(request, "nameAr");

const readRequestedServiceIds = (body) => {
  const source = Array.isArray(body?.serviceIds)
    ? body.serviceIds
    : typeof body?.serviceId === "string"
      ? [body.serviceId]
      : null;
  if (!source || source.length === 0) return null;

  const ids = [];
  for (const value of source) {
    if (typeof value !== "string" || !mongoose.isValidObjectId(value)) return null;
    if (!ids.includes(value)) ids.push(value);
  }
  return ids;
};

const toPublicHelpRequest = (request, includeVolunteerName) => ({
  id: request._id.toString(),
  serviceName: requestServiceName(request),
  serviceNameAr: requestServiceNameAr(request),
  serviceIds: requestServiceIds(request),
  description: request.description || "",
  latitude: request.latitude,
  longitude: request.longitude,
  governorate: request.governorate || "muscat",
  wilayat: request.wilayat,
  area: request.area || "",
  street: request.street || "",
  building: request.building || "",
  landmark: request.landmark || "",
  status: request.status,
  createdAt: request.createdAt,
  ...(includeVolunteerName
    ? { volunteerName: request.volunteerId?.fullName || null }
    : {}),
});

const pdfEscape = (value) =>
  String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const formatReportDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const clipReportText = (value, length) => {
  const text = String(value || "-");
  return text.length > length ? `${text.slice(0, length - 3)}...` : text;
};

const buildUsersReportPdf = (records) => {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 36;
  const columns = [
    ["Full Name", 140],
    ["Email", 180],
    ["Phone", 78],
    ["Role", 78],
    ["Volunteer Status", 110],
    ["Date of Birth", 88],
    ["Created", 88],
  ];
  const limits = [22, 30, 12, 13, 16, 12, 12];
  const tableWidth = columns.reduce((sum, column) => sum + column[1], 0);
  const rowHeight = 18;
  const rowsPerPage = 22;
  const pages = [];

  if (records.length === 0) pages.push([]);
  for (let index = 0; index < records.length; index += rowsPerPage) {
    pages.push(records.slice(index, index + rowsPerPage));
  }

  const generated = `${formatReportDate(new Date())} ${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`;
  const streams = pages.map((pageRows, pageIndex) => {
    const commands = [];
    const text = (x, y, size, value) => {
      commands.push("BT");
      commands.push(`/F1 ${size} Tf`);
      commands.push(`${x} ${y} Td`);
      commands.push(`(${pdfEscape(value)}) Tj`);
      commands.push("ET");
    };

    text(margin, pageHeight - 42, 16, "HelpNearby Users Report");
    text(margin, pageHeight - 62, 10, `Generated: ${generated}`);
    text(
      margin,
      pageHeight - 78,
      10,
      "Sorted by account creation date, oldest first.",
    );

    let y = pageHeight - 102;
    commands.push("0.93 g");
    commands.push(`${margin} ${y - 4} ${tableWidth} 18 re f`);
    commands.push("0 g");

    let x = margin;
    columns.forEach(([title, width]) => {
      text(x + 4, y, 9, title);
      x += width;
    });

    y -= rowHeight;
    if (pageRows.length === 0) text(margin + 4, y, 10, "No records.");

    pageRows.forEach((record) => {
      commands.push("0.82 G");
      commands.push(`${margin} ${y - 6} m ${margin + tableWidth} ${y - 6} l S`);
      commands.push("0 G");
      let cellX = margin;
      record.forEach((value, cellIndex) => {
        text(cellX + 4, y, 8, clipReportText(value, limits[cellIndex]));
        cellX += columns[cellIndex][1];
      });
      y -= rowHeight;
    });

    text(margin, 24, 9, `Page ${pageIndex + 1} of ${pages.length}`);
    return commands.join("\n");
  });

  const bodies = [];
  const reserve = () => {
    bodies.push("");
    return bodies.length;
  };
  const catalogId = reserve();
  const pagesId = reserve();
  const fontId = reserve();
  const pageIds = streams.map(() => reserve());
  const contentIds = streams.map(() => reserve());

  bodies[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  bodies[pagesId - 1] =
    `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  bodies[fontId - 1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  streams.forEach((stream, index) => {
    bodies[contentIds[index] - 1] =
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
    bodies[pageIds[index] - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
  });

  const parts = ["%PDF-1.4\n"];
  let position = Buffer.byteLength(parts[0]);
  const xref = [0];

  bodies.forEach((body, index) => {
    xref.push(position);
    const chunk = `${index + 1} 0 obj\n${body}\nendobj\n`;
    parts.push(chunk);
    position += Buffer.byteLength(chunk);
  });

  const xrefStart = position;
  let xrefTable = `xref\n0 ${xref.length}\n`;
  xref.forEach((offset, index) => {
    xrefTable +=
      index === 0
        ? "0000000000 65535 f \n"
        : `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  parts.push(xrefTable);
  parts.push(
    `trailer\n<< /Size ${xref.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`,
  );
  return Buffer.from(parts.join(""), "utf8");
};

app.get("/api/services", async (_req, res) => {
  try {
    const services = await Service.find({ isVisible: true })
      .select("name nameAr description descriptionAr categoryId")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      services: services.map((service) => ({
        id: service._id.toString(),
        name: service.name,
        nameAr: typeof service.nameAr === "string" ? service.nameAr : "",
        description: service.description,
        descriptionAr: typeof service.descriptionAr === "string" ? service.descriptionAr : "",
        category: categoryIdValue(service.categoryId) || null,
      })),
    });
  } catch (error) {
    console.error("Fetch visible services failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/admin/help-requests/status-counts", async (req, res) => {
  try {
    const adminLookup = await findActiveAdmin(req.query.adminId);
    if (!adminLookup.user) {
      return res.status(adminLookup.status).json({ errorCode: adminLookup.errorCode });
    }

    const rows = await HelpRequest.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(HELP_REQUEST_STATUSES.map((status) => [status, 0]));
    for (const row of rows) {
      if (Object.prototype.hasOwnProperty.call(counts, row._id)) {
        counts[row._id] = row.count;
      }
    }

    return res.status(200).json({ counts });
  } catch (error) {
    console.error("Help request status counts failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/admin/help-requests", async (req, res) => {
  try {
    const adminLookup = await findActiveAdmin(req.query.adminId);
    if (!adminLookup.user) {
      return res.status(adminLookup.status).json({ errorCode: adminLookup.errorCode });
    }

    const requests = await HelpRequest.find()
      .populate("userId", "fullName email phone")
      .populate("volunteerId", "fullName")
      .populate("serviceId", "name nameAr categoryId")
      .populate("serviceIds", "name nameAr categoryId")
      .sort({ createdAt: -1 });

    const pendingListed = requests.some((request) => request.status === "pending");
    if (pendingListed) await refreshKnownCategories();
    const approvedVolunteers = pendingListed
      ? await User.find({
        role: "volunteer",
        volunteerStatus: "approved",
        accountStatus: { $ne: "blocked" },
      }).select("skills").lean()
      : [];

    const matchingStatusFor = (request) => {
      if (request.status !== "pending") return null;
      const services = [
        ...(Array.isArray(request.serviceIds) ? request.serviceIds : []),
        request.serviceId,
      ].filter(Boolean);
      const categories = [...new Set(services.map((service) => activeServiceCategory(service)).filter(Boolean))];
      const matched = approvedVolunteers.filter((volunteer) =>
        volunteerSkillMatches(volunteer.skills, categories),
      );
      if (!matched.length) return "noMatch";
      const declined = new Set(
        (request.offerAttempts || [])
          .filter((attempt) => attempt?.result === "declined" && attempt.volunteerId)
          .map((attempt) => String(attempt.volunteerId)),
      );
      const remaining = matched.filter((volunteer) => !declined.has(String(volunteer._id)));
      return remaining.length ? "searching" : "exhausted";
    };

    return res.status(200).json({
      requests: requests.map((request) => {
        const services = [
          ...(Array.isArray(request.serviceIds) ? request.serviceIds : []),
          request.serviceId,
        ].filter(Boolean);
        const serviceCategories = [...new Set(
          services
            .map((service) => categoryIdValue(service?.categoryId))
            .filter(Boolean),
        )];
        return {
        id: request._id.toString(),
        requestNumber: Number.isInteger(request.requestNumber) ? request.requestNumber : null,
        requesterName: request.userId?.fullName || "",
        requesterEmail: request.userId?.email || "",
        requesterPhone: request.userId?.phone || "",
        serviceName: requestServiceName(request),
        serviceNameAr: requestServiceNameAr(request),
        description: request.description || "",
        volunteerName: request.volunteerId?.fullName || "",
        status: request.status,
        createdAt: request.createdAt,
        acceptedAt: request.acceptedAt || null,
        updatedAt: request.updatedAt || null,
        governorate: request.governorate || "muscat",
        wilayat: request.wilayat || "",
        area: request.area || "",
        street: request.street || "",
        building: request.building || "",
        landmark: request.landmark || "",
        latitude: request.latitude,
        longitude: request.longitude,
        serviceCategories,
        matchingStatus: matchingStatusFor(request),
      };
      }),
    });
  } catch (error) {
    console.error("Fetch admin help requests failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/admin/users", async (_req, res) => {
  try {
    const users = await User.find({
      role: "user",
      volunteerStatus: "not-applicable",
    })
      .select("fullName email phone role volunteerStatus dateOfBirth createdAt accountStatus")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      users: users.map(({ _id, accountStatus, ...user }) => ({
        id: _id.toString(),
        ...user,
        accountStatus: accountStatus === "blocked" ? "blocked" : "active",
      })),
    });
  } catch (error) {
    console.error("Fetch users failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/admin/users/report/pdf", async (_req, res) => {
  try {
    const users = await User.find({ role: { $in: ["user", "volunteer"] } })
      .select("fullName email phone role volunteerStatus dateOfBirth createdAt")
      .sort({ createdAt: 1 })
      .lean();

    const roleLabels = {
      user: "User",
      volunteer: "Volunteer",
      admin: "Administrator",
    };
    const statusLabels = {
      "not-applicable": "Not applicable",
      pending: "Pending",
      approved: "Approved",
      rejected: "Rejected",
    };

    const pdf = buildUsersReportPdf(
      users.map((user) => [
        user.fullName,
        user.email,
        user.role === "volunteer" ? user.phone || "-" : "-",
        roleLabels[user.role] || user.role,
        statusLabels[user.volunteerStatus] || user.volunteerStatus,
        formatReportDate(user.dateOfBirth),
        formatReportDate(user.createdAt),
      ]),
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="helpnearby-users-report.pdf"',
    );
    return res.status(200).send(pdf);
  } catch (error) {
    console.error("User report failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.put("/api/admin/users/:id/profile", async (req, res) => {
  try {
    const lookup = await findAccount(req.params.id, { allowBlocked: true });
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    const user = lookup.user;
    if (!isNormalUser(user)) {
      return res.status(409).json({ errorCode: "USER_NOT_MANAGEABLE" });
    }

    const fullName =
      typeof req.body.fullName === "string" ? req.body.fullName.trim() : "";

    if (!FULL_NAME_PATTERN.test(fullName)) {
      return res.status(400).json({ errorCode: "INVALID_FULL_NAME" });
    }

    user.fullName = fullName;
    await user.save();

    return res.status(200).json({
      messageCode: "USER_UPDATED",
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        volunteerStatus: user.volunteerStatus,
        dateOfBirth: user.dateOfBirth,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("Update managed user failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.put("/api/admin/users/:id/account-status", async (req, res) => {
  try {
    const adminLookup = await findActiveAdmin(req.body?.adminId);
    if (!adminLookup.user) {
      return res.status(adminLookup.status).json({ errorCode: adminLookup.errorCode });
    }

    const lookup = await findAccount(req.params.id, { allowBlocked: true });
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    const nextStatus = req.body?.accountStatus;
    if (nextStatus !== "active" && nextStatus !== "blocked") {
      return res.status(400).json({ errorCode: "INVALID_ACCOUNT_STATUS" });
    }

    const target = lookup.user;
    if (String(target._id) === String(adminLookup.user._id)) {
      return res.status(403).json({ errorCode: "CANNOT_BLOCK_SELF" });
    }

    if (target.role === "admin") {
      return res.status(403).json({ errorCode: "CANNOT_BLOCK_ADMIN" });
    }

    if (accountStatusValue(target) === nextStatus) {
      return res.status(409).json({ errorCode: "ACCOUNT_STATUS_UNCHANGED" });
    }

    target.accountStatus = nextStatus;
    await target.save();

    const blocked = nextStatus === "blocked";
    await recordActivity({ type: blocked ? "account_blocked" : "account_unblocked" });
    const notified = await createNotifications({
      userId: target._id,
      type: blocked ? "account_blocked" : "account_unblocked",
    });
    if (!notified) {
      console.error("Account status notification was not saved.");
    }

    await sendAccountStatusEmail(target, blocked);
    if (blocked) disconnectBlockedAccount(target._id);
    if (!blocked) await recoverOpenBoardForVolunteer(target);

    return res.status(200).json({
      messageCode: blocked ? "USER_BLOCKED" : "USER_UNBLOCKED",
      user: {
        id: target._id.toString(),
        accountStatus: target.accountStatus,
      },
    });
  } catch (error) {
    console.error("Account status update failed.");
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/geocode/reverse", async (req, res) => {
  const latitude = readCoordinate(req.query.latitude);
  const longitude = readCoordinate(req.query.longitude);

  if (
    latitude == null ||
    longitude == null ||
    !isInsideMuscat(latitude, longitude)
  ) {
    return res.status(400).json({ errorCode: "INVALID_LOCATION" });
  }

  try {
    const address = await reverseGeocode(latitude, longitude);
    return res.status(200).json(address);
  } catch (error) {
    console.error("Reverse geocoding failed:", {
      latitude,
      longitude,
      error,
    });
    return res.status(200).json(emptyGeocode());
  }
});

app.post("/api/help-requests", async (req, res) => {
  let createdRequest = null;
  let createdNotificationIds = [];
  let createdActivityId = null;
  try {
    const lookup = await findAccount(req.body.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (!isNormalUser(lookup.user)) {
      return res.status(403).json({ errorCode: "NOT_ALLOWED" });
    }

    const serviceIds = readRequestedServiceIds(req.body);
    if (!serviceIds) {
      return res.status(400).json({ errorCode: "INVALID_SERVICE_ID" });
    }

    const visibleServices = await Service.find({
      _id: { $in: serviceIds },
      isVisible: true,
    }).select("_id categoryId");
    if (visibleServices.length !== serviceIds.length) {
      return res.status(400).json({ errorCode: "SERVICE_NOT_AVAILABLE" });
    }

    const latitude = readCoordinate(req.body.latitude);
    const longitude = readCoordinate(req.body.longitude);
    if (
      latitude == null ||
      longitude == null ||
      !isInsideMuscat(latitude, longitude)
    ) {
      return res.status(400).json({ errorCode: "INVALID_LOCATION" });
    }

    if (req.body.locationConfirmed !== true) {
      return res.status(400).json({ errorCode: "LOCATION_NOT_CONFIRMED" });
    }

    const address = readConfirmedAddress(req.body);
    if (!address) {
      return res.status(400).json({ errorCode: "INVALID_ADDRESS" });
    }

    const description = readDescription(req.body.description);
    if (description == null) {
      return res.status(400).json({ errorCode: "INVALID_DESCRIPTION" });
    }

    const categories = [...new Set(
      visibleServices
        .map((service) => categoryIdValue(service.categoryId))
        .filter(Boolean),
    )].sort();

    return await withHelpRequestCreateLock(lookup.user._id, async () => {
      const duplicate = await recentDuplicateRequest({
        userId: lookup.user._id,
        serviceIds,
        categories,
        description,
        latitude,
        longitude,
      });
      if (duplicate) {
        const existing = await HelpRequest.findById(duplicate._id)
          .populate("serviceId", "name nameAr")
          .populate("serviceIds", "name nameAr");
        return res.status(201).json({
          messageCode: "REQUEST_CREATED",
          duplicate: true,
          request: toPublicHelpRequest(existing, false),
        });
      }

      const request = await createNumberedRequest({
        userId: lookup.user._id,
        serviceId: serviceIds[0],
        serviceIds,
        description,
        latitude,
        longitude,
        ...address,
        status: "pending",
      });
      createdRequest = request;

      const admins = await User.find({
        role: "admin",
        accountStatus: { $ne: "blocked" },
      }).select("_id").lean();
      const skills = await requestServiceSkills(request);
      const eligible = await skillMatchedVolunteers(skills, { availableOnly: true });
      const notifications = [
        withRequestNumber({
          userId: lookup.user._id,
          type: "help_request_created",
          relatedRequestId: request._id,
        }, request),
        ...admins.map((admin) => withRequestNumber({
          userId: admin._id,
          type: "admin_help_request_created",
          relatedRequestId: request._id,
        }, request)),
      ];
      if (eligible.length === 0) {
        notifications.push(withRequestNumber({
          userId: lookup.user._id,
          type: "help_request_unmatched",
          relatedRequestId: request._id,
        }, request));
      } else {
        notifications.push(...eligible.map((volunteer) => withRequestNumber({
          userId: volunteer._id,
          type: "new_help_request",
          relatedRequestId: request._id,
        }, request)));
      }
      const notificationTracker = { ids: [] };
      const notified = await createNotifications(notifications, notificationTracker);
      createdNotificationIds = notificationTracker.ids;
      if (!notified) {
        throw new Error("Help request notifications were not saved");
      }

      const activity = await recordActivity({
        type: "help_request_created",
        userId: lookup.user._id,
        relatedRequestId: request._id,
      });
      if (!activity?._id) {
        throw new Error("Help request activity was not saved");
      }
      createdActivityId = activity._id;

      await publishRequestLifecycle(request, "pending");

      const populated = await HelpRequest.findById(request._id)
        .populate("serviceId", "name nameAr")
        .populate("serviceIds", "name nameAr");
      createdRequest = null;
      createdNotificationIds = [];
      createdActivityId = null;

      return res.status(201).json({
        messageCode: "REQUEST_CREATED",
        request: toPublicHelpRequest(populated, false),
      });
    });
  } catch (error) {
    console.error("Create help request failed:", error);
    try {
      await removeFailedHelpRequest({
        requestId: createdRequest?._id,
        notificationIds: createdNotificationIds,
        activityId: createdActivityId,
      });
    } catch (cleanupError) {
      console.error("Failed help request cleanup failed:", cleanupError);
    }
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/help-requests/my", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (lookup.user.role !== "user") {
      return res.status(403).json({ errorCode: "NOT_ALLOWED" });
    }

    const requests = await HelpRequest.find({ userId: lookup.user._id })
      .populate("serviceId", "name nameAr")
      .populate("serviceIds", "name nameAr")
      .populate("volunteerId", "fullName")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      requests: requests.map((request) => toPublicHelpRequest(request, true)),
    });
  } catch (error) {
    console.error("Fetch my help requests failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

const storedCoordinate = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const distanceKmBetween = (fromLatitude, fromLongitude, toLatitude, toLongitude) => {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const startLatitude = toRadians(fromLatitude);
  const endLatitude = toRadians(toLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const kilometers = earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return Math.round(kilometers * 1000) / 1000;
};

const canViewVolunteerLocations = (user) =>
  isApprovedVolunteer(user) || isNormalUser(user) || user.role === "admin";

const ACTIVE_REQUEST_STATUSES = ["accepted", "in-progress"];

const volunteerHasActiveRequest = (volunteerId, exceptRequestId = null) => {
  const filter = {
    volunteerId,
    status: { $in: ACTIVE_REQUEST_STATUSES },
  };
  if (exceptRequestId) filter._id = { $ne: exceptRequestId };
  return HelpRequest.exists(filter);
};

const claimVolunteerRequest = async (volunteerId, requestId) => {
  if (await volunteerHasActiveRequest(volunteerId, requestId)) return false;
  const claimed = await User.findOneAndUpdate(
    {
      _id: volunteerId,
      $or: [
        { activeHelpRequestId: null },
        { activeHelpRequestId: { $exists: false } },
      ],
    },
    { $set: { activeHelpRequestId: requestId } },
  );
  return Boolean(claimed);
};

const releaseVolunteerRequest = async (volunteerId, requestId) => {
  if (!volunteerId || !requestId) return;
  await User.updateOne(
    { _id: volunteerId, activeHelpRequestId: requestId },
    { $set: { activeHelpRequestId: null } },
  );
};

const requestServiceSkills = async (request) => {
  const ids = requestServiceIds(request);
  if (!ids.length) return [];
  const services = await Service.find({ _id: { $in: ids } }).select("categoryId").lean();
  await refreshKnownCategories();
  return [...new Set(services.map((service) => activeServiceCategory(service)).filter(Boolean))];
};

const volunteerSkillMatches = (volunteerSkills, serviceCategories) => {
  const skills = new Set(matchingCategoryIds(volunteerSkills));
  if (!skills.size || !Array.isArray(serviceCategories)) return false;
  return serviceCategories.some((category) => {
    const id = categoryIdValue(category);
    return Boolean(id) && skills.has(id);
  });
};

const skillMatchedVolunteers = async (categories, { availableOnly = false } = {}) => {
  if (!categories.length) return [];
  const filter = {
    role: "volunteer",
    volunteerStatus: "approved",
    accountStatus: { $ne: "blocked" },
  };
  if (availableOnly) {
    const busyVolunteerIds = await HelpRequest.distinct("volunteerId", {
      volunteerId: { $ne: null },
      status: { $in: ACTIVE_REQUEST_STATUSES },
    });
    filter._id = { $nin: busyVolunteerIds };
  }
  const volunteers = await User.find(filter).select("_id skills latitude longitude").lean();
  return volunteers.filter((volunteer) => volunteerSkillMatches(volunteer.skills, categories));
};

const publishRequestUpdate = (userIds, requestId, status) => {
  const payload = { requestId: String(requestId), status };
  for (const userId of new Set(userIds.filter(Boolean).map((id) => String(id)))) {
    emitToUserSockets(userId, "help_request_updated", payload);
  }
};

const publishRequestLifecycle = async (request, status, extraUserIds = []) => {
  if (!request?._id) return;
  const skills = await requestServiceSkills(request);
  const matched = await skillMatchedVolunteers(skills);
  const admins = await User.find({
    role: "admin",
    accountStatus: { $ne: "blocked" },
  })
    .select("_id")
    .lean();
  publishRequestUpdate(
    [
      request.userId,
      request.volunteerId,
      ...matched.map((volunteer) => volunteer._id),
      ...admins.map((admin) => admin._id),
      ...extraUserIds,
    ],
    request._id,
    status,
  );
};

const volunteerDeclinedRequest = (request, volunteerId) =>
  (request?.offerAttempts || []).some(
    (attempt) =>
      attempt?.result === "declined" &&
      attempt.volunteerId &&
      String(attempt.volunteerId) === String(volunteerId),
  );

const recoverOpenBoardForVolunteer = async (volunteerOrId, { exceptRequestId = null } = {}) => {
  try {
    const volunteer = volunteerOrId?._id && volunteerOrId?.role
      ? volunteerOrId
      : await User.findById(volunteerOrId)
        .select("role volunteerStatus accountStatus skills")
        .lean();
    if (!volunteer?._id || !isApprovedVolunteer(volunteer) || volunteer.accountStatus === "blocked") {
      return;
    }
    const skills = matchingCategoryIds(volunteer.skills);
    if (!skills.length || await volunteerHasActiveRequest(volunteer._id)) return;

    await refreshKnownCategories();
    const active = activeCategoryIds();
    const matchable = skills.filter((id) => active.has(id));
    if (!matchable.length) return;

    const services = await Service.find({ categoryId: { $type: "string" } }).select("_id categoryId").lean();
    const matchingServices = services.filter((service) => {
      const id = activeServiceCategory(service);
      return id && matchable.includes(id);
    });
    if (!matchingServices.length) return;
    const categoryByService = new Map(
      matchingServices.map((service) => [String(service._id), activeServiceCategory(service)]),
    );
    const pending = await HelpRequest.find({
      status: "pending",
      volunteerId: null,
      $or: [
        { serviceId: { $in: matchingServices.map((service) => service._id) } },
        { serviceIds: { $in: matchingServices.map((service) => service._id) } },
      ],
    }).select("_id userId requestNumber offerAttempts serviceId serviceIds").lean();

    const exceptId = exceptRequestId ? String(exceptRequestId) : "";
    const candidates = pending.filter((request) => {
      if (exceptId && String(request._id) === exceptId) return false;
      if (volunteerDeclinedRequest(request, volunteer._id)) return false;
      const requestCategories = requestServiceIds(request)
        .map((id) => categoryByService.get(id))
        .filter(Boolean);
      return volunteerSkillMatches(skills, requestCategories);
    });
    if (!candidates.length) return;

    const existing = await Notification.find({
      userId: volunteer._id,
      type: "new_help_request",
      relatedRequestId: { $in: candidates.map((request) => request._id) },
    }).select("relatedRequestId").lean();
    const alreadyNotified = new Set(existing.map((notice) => String(notice.relatedRequestId)));
    const fresh = candidates.filter((request) => !alreadyNotified.has(String(request._id)));
    if (!fresh.length) return;

    const notified = await createNotifications(fresh.map((request) => withRequestNumber({
      userId: volunteer._id,
      type: "new_help_request",
      relatedRequestId: request._id,
    }, request)));
    if (!notified) {
      console.error("Open-board recovery notifications were not saved:", {
        volunteerId: String(volunteer._id),
      });
      return;
    }
    for (const request of fresh) {
      await publishRequestLifecycle(request, "pending", [volunteer._id]);
    }
  } catch (error) {
    console.error("Open-board recovery failed:", error);
  }
};

const recoverOpenBoardForService = async (serviceId) => {
  try {
    if (!serviceId) return;
    const pending = await HelpRequest.find({
      status: "pending",
      volunteerId: null,
      $or: [{ serviceId }, { serviceIds: serviceId }],
    }).select("_id userId requestNumber offerAttempts serviceId serviceIds").lean();

    for (const request of pending) {
      const skills = await requestServiceSkills(request);
      const eligible = await skillMatchedVolunteers(skills, { availableOnly: true });
      const recipients = eligible.filter(
        (volunteer) => !volunteerDeclinedRequest(request, volunteer._id),
      );
      if (!recipients.length) continue;

      const existing = await Notification.find({
        type: "new_help_request",
        relatedRequestId: request._id,
        userId: { $in: recipients.map((volunteer) => volunteer._id) },
      }).select("userId").lean();
      const alreadyNotified = new Set(existing.map((notice) => String(notice.userId)));
      const fresh = recipients.filter((volunteer) => !alreadyNotified.has(String(volunteer._id)));
      if (!fresh.length) continue;

      const notified = await createNotifications(fresh.map((volunteer) => withRequestNumber({
        userId: volunteer._id,
        type: "new_help_request",
        relatedRequestId: request._id,
      }, request)));
      if (!notified) {
        console.error("Open-board service recovery notifications were not saved:", {
          requestId: String(request._id),
        });
        continue;
      }
      await publishRequestLifecycle(request, "pending");
    }
  } catch (error) {
    console.error("Open-board service recovery failed:", error);
  }
};

let obsoleteCategorySlugIndexRemoved = false;

const ensureObsoleteCategorySlugIndexRemoved = async () => {
  if (obsoleteCategorySlugIndexRemoved) return;
  const indexes = await Category.collection.indexes();
  const slugIndex = indexes.find((index) => index.key?.slug === 1);
  if (slugIndex) await Category.collection.dropIndex(slugIndex.name);
  obsoleteCategorySlugIndexRemoved = true;
};

const allocateCounter = async (key) => {
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { new: true, upsert: true },
  );
  return counter.value;
};

const allocateRequestNumber = () => allocateCounter("helpRequest");

const helpRequestCreateGates = new Map();

const withHelpRequestCreateLock = async (userId, work) => {
  const key = String(userId);
  const previous = helpRequestCreateGates.get(key) || Promise.resolve();
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => gate);
  helpRequestCreateGates.set(key, chained);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (helpRequestCreateGates.get(key) === chained) {
      helpRequestCreateGates.delete(key);
    }
  }
};

const normalizeRequestDescription = (value) =>
  String(value || "").trim().replace(/\s+/g, " ");

const sameIdSet = (left, right) => {
  const first = [...new Set(left.map(String))].sort();
  const second = [...new Set(right.map(String))].sort();
  return first.length === second.length && first.every((id, index) => id === second[index]);
};

const categoryKey = (values) => [...new Set(
  (Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean),
)].sort().join("\n");

const isRequestNumberConflict = (error) =>
  error?.code === 11000 && (
    Boolean(error?.keyPattern?.requestNumber) ||
    /requestNumber/i.test(String(error?.message || ""))
  );

const recentDuplicateRequest = async ({
  userId,
  serviceIds,
  categories,
  description,
  latitude,
  longitude,
}) => {
  const candidates = await HelpRequest.find({
    userId,
    status: "pending",
    latitude,
    longitude,
    createdAt: { $gte: new Date(Date.now() - 20000) },
  }).sort({ createdAt: -1 });
  const descriptionKey = normalizeRequestDescription(description);
  const requestedCategories = categoryKey(categories);

  return candidates.find((request) => {
    if (!sameIdSet(requestServiceIds(request), serviceIds)) return false;
    if (normalizeRequestDescription(request.description) !== descriptionKey) return false;
    const storedCategories = categoryKey(request.categories);
    if (requestedCategories && storedCategories && requestedCategories !== storedCategories) {
      return false;
    }
    return true;
  }) || null;
};

const createNumberedRequest = async (fields) => {
  const payload = { ...fields, requestNumber: await allocateRequestNumber() };
  try {
    return await HelpRequest.create(payload);
  } catch (error) {
    if (!isRequestNumberConflict(error)) throw error;
    return HelpRequest.create({
      ...fields,
      requestNumber: await allocateRequestNumber(),
    });
  }
};

const removeFailedHelpRequest = async ({ requestId, notificationIds, activityId }) => {
  if (!requestId) return;

  const cleanupSteps = [];
  if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    cleanupSteps.push(() => Notification.deleteMany({
      _id: { $in: notificationIds },
      relatedRequestId: requestId,
    }));
  }
  if (activityId) {
    cleanupSteps.push(() => Activity.deleteOne({
      _id: activityId,
      relatedRequestId: requestId,
      type: "help_request_created",
    }));
  }
  cleanupSteps.push(() => HelpRequest.deleteOne({
    _id: requestId,
    status: "pending",
    volunteerId: null,
    acceptedAt: null,
    "offerAttempts.0": { $exists: false },
  }));

  for (const step of cleanupSteps) {
    try {
      await step();
    } catch (error) {
      console.error("Failed help request cleanup failed:", error);
    }
  }
};

const backfillRequestNumbers = async () => {
  const missing = await HelpRequest.find({
    $or: [{ requestNumber: null }, { requestNumber: { $exists: false } }],
  })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id")
    .lean();
  const highest = await HelpRequest.findOne({ requestNumber: { $type: "number" } })
    .sort({ requestNumber: -1 })
    .select("requestNumber")
    .lean();
  let next = Number(highest?.requestNumber) || 0;

  for (const request of missing) {
    next += 1;
    const updated = await HelpRequest.updateOne(
      {
        _id: request._id,
        $or: [{ requestNumber: null }, { requestNumber: { $exists: false } }],
      },
      { $set: { requestNumber: next } },
    );
    if (!updated.modifiedCount) next -= 1;
  }

  const currentMax = await HelpRequest.findOne({ requestNumber: { $type: "number" } })
    .sort({ requestNumber: -1 })
    .select("requestNumber")
    .lean();
  await Counter.updateOne(
    { key: "helpRequest" },
    { $max: { value: Number(currentMax?.requestNumber) || 0 } },
    { upsert: true },
  );
};

const advanceHelpRequestOffer = async (request, extraUserIds = []) => {
  if (!request || request.status !== "pending" || request.volunteerId) return;

  const skills = await requestServiceSkills(request);
  const eligible = await skillMatchedVolunteers(skills, { availableOnly: true });
  const dismissedIds = new Set(
    (request.offerAttempts || [])
      .filter((attempt) => attempt?.result === "declined" && attempt.volunteerId)
      .map((attempt) => String(attempt.volunteerId)),
  );
  const alreadyNotified = new Set(
    (Array.isArray(extraUserIds) ? extraUserIds : [])
      .filter(Boolean)
      .map((id) => String(id)),
  );
  const recipients = [];
  const seen = new Set();
  for (const volunteer of eligible) {
    const id = String(volunteer._id);
    if (dismissedIds.has(id) || alreadyNotified.has(id) || seen.has(id)) continue;
    seen.add(id);
    recipients.push(volunteer);
  }

  if (recipients.length > 0) {
    const existing = await Notification.find({
      type: "new_help_request",
      relatedRequestId: request._id,
      userId: { $in: recipients.map((volunteer) => volunteer._id) },
    }).select("userId").lean();
    const alreadyHaveNotice = new Set(existing.map((notice) => String(notice.userId)));
    const fresh = recipients.filter((volunteer) => !alreadyHaveNotice.has(String(volunteer._id)));
    if (fresh.length > 0) {
      const notified = await createNotifications(
        fresh.map((volunteer) => withRequestNumber({
          userId: volunteer._id,
          type: "new_help_request",
          relatedRequestId: request._id,
        }, request)),
      );
      if (!notified) {
        console.error("Reopened help request notifications were not saved:", {
          requestId: String(request._id),
        });
      }
    }
  }

  await publishRequestLifecycle(request, "pending", extraUserIds);
};

const compareVolunteerBoard = (left, right) => {
  const leftPending = left.status === "pending";
  const rightPending = right.status === "pending";
  const byNewest = () =>
    new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
  if (leftPending && rightPending) {
    const leftDistance = typeof left.distanceKm === "number" ? left.distanceKm : null;
    const rightDistance = typeof right.distanceKm === "number" ? right.distanceKm : null;
    if (leftDistance == null && rightDistance == null) return byNewest();
    if (leftDistance == null) return 1;
    if (rightDistance == null) return -1;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return byNewest();
  }
  if (leftPending !== rightPending) return leftPending ? -1 : 1;
  return byNewest();
};

const MAP_TILE_USER_AGENT = "HelpNearbySystem/1.0 (local help-request map)";
const mapTileCache = new Map();
const mapTilePending = new Map();
const MAP_TILE_CACHE_LIMIT = 256;
let mapTileWarningLogged = false;

const mapTileMaxAge = (header) => {
  const match = /max-age=(\d+)/i.exec(header || "");
  const seconds = match ? Number(match[1]) : 0;
  return seconds > 0 ? seconds : 7 * 24 * 60 * 60;
};

const rememberMapTile = (key, entry) => {
  mapTileCache.delete(key);
  mapTileCache.set(key, entry);
  while (mapTileCache.size > MAP_TILE_CACHE_LIMIT) {
    const oldest = mapTileCache.keys().next().value;
    mapTileCache.delete(oldest);
  }
};

const loadMapTile = (key) => {
  const cached = mapTileCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached);
  if (mapTilePending.has(key)) return mapTilePending.get(key);

  const pending = fetch(`https://tile.openstreetmap.org/${key}.png`, {
    headers: {
      Accept: "image/png",
      "User-Agent": MAP_TILE_USER_AGENT,
    },
    signal: AbortSignal.timeout(8000),
  })
    .then(async (response) => {
      const blocked = response.headers.get("x-blocked");
      if (!response.ok || blocked) {
        if (!mapTileWarningLogged) {
          mapTileWarningLogged = true;
          console.error("Map tile request was rejected:", blocked || response.status);
        }
        return null;
      }
      const contentType = response.headers.get("content-type") || "";
      const bytes = Buffer.from(await response.arrayBuffer());
      const pngSignature =
        contentType.includes("image/png") &&
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;
      if (!pngSignature) return null;
      const cacheControl = response.headers.get("cache-control") || "public, max-age=604800";
      const entry = {
        body: bytes,
        cacheControl,
        expiresAt: Date.now() + mapTileMaxAge(cacheControl) * 1000,
      };
      rememberMapTile(key, entry);
      return entry;
    })
    .finally(() => {
      mapTilePending.delete(key);
    });

  mapTilePending.set(key, pending);
  return pending;
};

app.get("/api/map-tiles/:z/:x/:y", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }
    if (!canViewVolunteerLocations(lookup.user)) {
      return res.status(403).json({ errorCode: "NOT_ALLOWED" });
    }

    const zoom = Number(req.params.z);
    const x = Number(req.params.x);
    const y = Number(req.params.y);
    const tileCount = 2 ** zoom;
    const valid =
      Number.isInteger(zoom) &&
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      zoom >= 0 &&
      zoom <= 19 &&
      x >= 0 &&
      y >= 0 &&
      x < tileCount &&
      y < tileCount;
    if (!valid) return res.status(400).json({ errorCode: "INVALID_TILE" });

    const entry = await loadMapTile(`${zoom}/${x}/${y}`);
    if (!entry) return res.status(502).json({ errorCode: "MAP_TILE_UNAVAILABLE" });

    res.set("Content-Type", "image/png");
    res.set("Cache-Control", entry.cacheControl);
    return res.status(200).send(entry.body);
  } catch (error) {
    console.error("Map tile request failed:", error);
    return res.status(502).json({ errorCode: "MAP_TILE_UNAVAILABLE" });
  }
});

app.get("/api/volunteer/location", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (!isApprovedVolunteer(lookup.user)) {
      return res.status(403).json({ errorCode: "VOLUNTEER_NOT_APPROVED" });
    }

    const latitude = storedCoordinate(lookup.user.latitude);
    const longitude = storedCoordinate(lookup.user.longitude);
    const hasLocation = latitude != null && longitude != null;

    return res.status(200).json({
      latitude: hasLocation ? latitude : null,
      longitude: hasLocation ? longitude : null,
    });
  } catch (error) {
    console.error("Fetch volunteer location failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.put("/api/volunteer/location", async (req, res) => {
  try {
    const lookup = await findAccount(req.body.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (!isApprovedVolunteer(lookup.user)) {
      return res.status(403).json({ errorCode: "VOLUNTEER_NOT_APPROVED" });
    }

    const latitude = readCoordinate(req.body.latitude);
    const longitude = readCoordinate(req.body.longitude);
    if (
      latitude == null ||
      longitude == null ||
      !isInsideMuscat(latitude, longitude)
    ) {
      return res.status(400).json({ errorCode: "INVALID_LOCATION" });
    }

    lookup.user.latitude = latitude;
    lookup.user.longitude = longitude;
    await lookup.user.save();

    return res.status(200).json({
      messageCode: "VOLUNTEER_LOCATION_SAVED",
      latitude: lookup.user.latitude,
      longitude: lookup.user.longitude,
    });
  } catch (error) {
    console.error("Save volunteer location failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/volunteers/locations", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (!canViewVolunteerLocations(lookup.user)) {
      return res.status(403).json({ errorCode: "NOT_ALLOWED" });
    }

    const volunteers = await User.find({
      role: "volunteer",
      volunteerStatus: "approved",
      latitude: { $type: "number" },
      longitude: { $type: "number" },
    })
      .select("latitude longitude")
      .lean();

    return res.status(200).json({
      volunteers: volunteers
        .filter(
          (volunteer) =>
            storedCoordinate(volunteer.latitude) != null &&
            storedCoordinate(volunteer.longitude) != null &&
            isInsideMuscat(volunteer.latitude, volunteer.longitude),
        )
        .map((volunteer) => ({
          id: volunteer._id.toString(),
          latitude: volunteer.latitude,
          longitude: volunteer.longitude,
        })),
    });
  } catch (error) {
    console.error("Fetch volunteer locations failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/volunteer/help-requests", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (!isApprovedVolunteer(lookup.user)) {
      return res.status(403).json({ errorCode: "VOLUNTEER_NOT_APPROVED" });
    }

    const requests = await HelpRequest.find({
      $or: [
        { status: "pending" },
        {
          volunteerId: lookup.user._id,
          status: { $in: ["accepted", "in-progress", "completed", "rejected"] },
        },
      ],
    })
      .populate("serviceId", "name nameAr categoryId")
      .populate("serviceIds", "name nameAr categoryId")
      .sort({ createdAt: -1 });

    await refreshKnownCategories();
    const viewerId = String(lookup.user._id);
    const visibleRequests = requests.filter((request) => {
      if (request.status !== "pending") return String(request.volunteerId || "") === viewerId;
      const declined = (request.offerAttempts || []).some(
        (attempt) => String(attempt.volunteerId) === viewerId && attempt.result === "declined",
      );
      if (declined) return false;
      const categories = [];
      for (const service of [
        ...(Array.isArray(request.serviceIds) ? request.serviceIds : []),
        request.serviceId,
      ]) {
        const id = activeServiceCategory(service);
        if (id && !categories.includes(id)) categories.push(id);
      }
      return volunteerSkillMatches(lookup.user.skills, categories);
    });

    const originLatitude = storedCoordinate(lookup.user.latitude);
    const originLongitude = storedCoordinate(lookup.user.longitude);
    const distanceAvailable =
      originLatitude != null &&
      originLongitude != null &&
      isInsideMuscat(originLatitude, originLongitude);

    const boardRequests = visibleRequests.map((request) => {
      const publicRequest = toPublicHelpRequest(request, false);
      if (request.status !== "pending") return publicRequest;

      const requestLatitude = storedCoordinate(request.latitude);
      const requestLongitude = storedCoordinate(request.longitude);
      const requestLocated =
        requestLatitude != null &&
        requestLongitude != null &&
        isInsideMuscat(requestLatitude, requestLongitude);
      publicRequest.distanceKm =
        distanceAvailable && requestLocated
          ? distanceKmBetween(
              originLatitude,
              originLongitude,
              requestLatitude,
              requestLongitude,
            )
          : null;
      return publicRequest;
    });
    boardRequests.sort(compareVolunteerBoard);

    return res.status(200).json({
      distanceAvailable,
      requests: boardRequests,
    });
  } catch (error) {
    console.error("Fetch volunteer help requests failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.post("/api/help-requests/:id/route", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ errorCode: "INVALID_REQUEST_ID" });
    }

    const lookup = await findAccount(req.body.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    const request = await HelpRequest.findById(req.params.id)
      .select("userId volunteerId status latitude longitude")
      .lean();
    if (!request) {
      return res.status(404).json({ errorCode: "REQUEST_NOT_FOUND" });
    }
    if (String(request.userId) !== String(lookup.user._id)) {
      return res.status(403).json({ errorCode: "NOT_ALLOWED" });
    }
    if (request.status !== "accepted" && request.status !== "in-progress") {
      return res.status(409).json({ errorCode: "TRACKING_NOT_ACTIVE" });
    }

    const volunteer = request.volunteerId
      ? await User.findById(request.volunteerId).select("latitude longitude").lean()
      : null;
    const originLatitude = storedCoordinate(volunteer?.latitude);
    const originLongitude = storedCoordinate(volunteer?.longitude);
    if (
      originLatitude == null ||
      originLongitude == null ||
      !isInsideMuscat(originLatitude, originLongitude)
    ) {
      return res.status(409).json({ errorCode: "NO_LIVE_LOCATION" });
    }

    const origin = { latitude: originLatitude, longitude: originLongitude };
    const destination = { latitude: request.latitude, longitude: request.longitude };
    const requestKey = String(request._id);
    const cached = roadRouteCache.get(requestKey);
    if (canReuseRoadRoute(cached, origin, destination, Date.now())) {
      return res.status(200).json({ route: cached });
    }

    let flight = roadRouteFlights.get(requestKey);
    if (!flight) {
      flight = new Promise((resolve, reject) => {
        fetchDrivingRoute(origin, destination).then(resolve, reject);
      });
      roadRouteFlights.set(requestKey, flight);
    }

    const result = await flight;
    if (result.errorCode) {
      if (roadRouteFlights.get(requestKey) === flight) roadRouteFlights.delete(requestKey);
      return res.status(result.status).json({
        errorCode: result.errorCode,
        origin,
        destination,
      });
    }

    roadRouteCache.set(requestKey, result.route);
    if (roadRouteFlights.get(requestKey) === flight) roadRouteFlights.delete(requestKey);

    const current = await HelpRequest.findById(requestKey).select("status").lean();
    if (current?.status !== "accepted" && current?.status !== "in-progress") {
      roadRouteCache.delete(requestKey);
      return res.status(409).json({ errorCode: "TRACKING_NOT_ACTIVE" });
    }

    return res.status(200).json({ route: result.route });
  } catch (error) {
    console.error("Road route failed:", error?.name || "error");
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.put("/api/help-requests/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ errorCode: "INVALID_REQUEST_ID" });
    }

    const lookup = await findAccount(req.body.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (req.body.status === "cancelled") {
      if (!isNormalUser(lookup.user)) {
        return res.status(403).json({ errorCode: "NOT_ALLOWED" });
      }

      const existing = await HelpRequest.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ errorCode: "REQUEST_NOT_FOUND" });
      }
      if (existing.userId?.toString() !== lookup.user._id.toString()) {
        return res.status(403).json({ errorCode: "NOT_ALLOWED" });
      }
      if (existing.status !== "pending") {
        return res.status(409).json({ errorCode: "CANCELLATION_NOT_ALLOWED" });
      }

      const cancelled = await HelpRequest.findOneAndUpdate(
        {
          _id: existing._id,
          userId: lookup.user._id,
          status: "pending",
        },
        { status: "cancelled" },
        { new: false },
      );
      if (!cancelled) {
        return res.status(409).json({ errorCode: "CANCELLATION_NOT_ALLOWED" });
      }

      const notified = await createNotifications(withRequestNumber({
        userId: cancelled.userId,
        type: "help_request_cancelled",
        relatedRequestId: cancelled._id,
      }, cancelled));
      if (!notified) {
        console.error("Cancellation notifications were not saved:", {
          requestId: String(cancelled._id),
        });
      }
      await recordActivity({
        type: "help_request_cancelled",
        userId: lookup.user._id,
        relatedRequestId: cancelled._id,
      });
      await publishRequestLifecycle(cancelled, "cancelled");

      const populated = await HelpRequest.findById(cancelled._id)
        .populate("serviceId", "name nameAr")
        .populate("serviceIds", "name nameAr")
        .populate("volunteerId", "fullName");
      return res.status(200).json({
        messageCode: "REQUEST_CANCELLED",
        request: toPublicHelpRequest(populated, true),
      });
    }

    if (
      !["accepted", "rejected", "in-progress", "completed"].includes(
        req.body.status,
      )
    ) {
      return res.status(400).json({ errorCode: "INVALID_REQUEST_STATUS" });
    }

    if (req.body.status === "completed") {
      if (!isApprovedVolunteer(lookup.user)) {
        return res
          .status(403)
          .json({ errorCode: "ONLY_VOLUNTEER_CAN_COMPLETE" });
      }

      const existing = await HelpRequest.findById(req.params.id).select(
        "status volunteerId",
      );
      if (!existing) {
        return res.status(404).json({ errorCode: "REQUEST_NOT_FOUND" });
      }
      if (existing.status !== "in-progress") {
        return res.status(409).json({ errorCode: "INVALID_STATUS_TRANSITION" });
      }
      if (existing.volunteerId?.toString() !== lookup.user._id.toString()) {
        return res
          .status(403)
          .json({ errorCode: "ONLY_VOLUNTEER_CAN_COMPLETE" });
      }

      const request = await HelpRequest.findOneAndUpdate(
        {
          _id: req.params.id,
          status: "in-progress",
          volunteerId: lookup.user._id,
        },
        { status: "completed" },
        { new: true },
      );

      if (!request) {
        return res.status(409).json({ errorCode: "INVALID_STATUS_TRANSITION" });
      }

      await releaseVolunteerRequest(request.volunteerId, request._id);
      clearRoadRoute(request._id);
      await createNotifications(withRequestNumber({
        userId: request.userId,
        type: "help_request_completed",
        relatedRequestId: request._id,
      }, request));
      await recordActivity({
        type: "help_request_completed",
        userId: lookup.user._id,
        relatedRequestId: request._id,
      });
      await publishRequestLifecycle(request, "completed");
      await recoverOpenBoardForVolunteer(lookup.user);

      const populated = await HelpRequest.findById(request._id)
        .populate("serviceId", "name nameAr")
        .populate("serviceIds", "name nameAr")
        .populate("volunteerId", "fullName");

      return res.status(200).json({
        messageCode: "REQUEST_COMPLETED",
        request: toPublicHelpRequest(populated, true),
      });
    }

    if (req.body.status === "in-progress") {
      if (!isApprovedVolunteer(lookup.user)) {
        return res.status(403).json({ errorCode: "VOLUNTEER_NOT_APPROVED" });
      }

      const request = await HelpRequest.findOneAndUpdate(
        {
          _id: req.params.id,
          status: "accepted",
          volunteerId: lookup.user._id,
        },
        { status: "in-progress", acceptedAt: null, reminderSent: false },
        { new: true },
      );

      if (!request) {
        const existing = await HelpRequest.findById(req.params.id).select(
          "_id",
        );
        if (!existing) {
          return res.status(404).json({ errorCode: "REQUEST_NOT_FOUND" });
        }
        return res.status(409).json({ errorCode: "INVALID_STATUS_TRANSITION" });
      }

      await createNotifications(withRequestNumber({
        userId: request.userId,
        type: "help_request_started",
        relatedRequestId: request._id,
      }, request));
      await recordActivity({
        type: "help_request_started",
        userId: lookup.user._id,
        relatedRequestId: request._id,
      });
      await publishRequestLifecycle(request, "in-progress");

      const populated = await HelpRequest.findById(request._id)
        .populate("serviceId", "name nameAr")
        .populate("serviceIds", "name nameAr")
        .populate("volunteerId", "fullName");

      return res.status(200).json({
        messageCode: "REQUEST_STARTED",
        request: toPublicHelpRequest(populated, true),
      });
    }

    if (!isApprovedVolunteer(lookup.user)) {
      return res.status(403).json({ errorCode: "VOLUNTEER_NOT_APPROVED" });
    }

    const current = await HelpRequest.findById(req.params.id);
    if (!current) {
      return res.status(404).json({ errorCode: "REQUEST_NOT_FOUND" });
    }
    if (current.status === "cancelled") {
      return res.status(409).json({ errorCode: "REQUEST_CANCELLED" });
    }

    const requestSkills = await requestServiceSkills(current);
    const skillMatch = volunteerSkillMatches(lookup.user.skills, requestSkills);

    if (req.body.status === "rejected" && current.status === "pending") {
      if (!skillMatch) {
        return res.status(403).json({ errorCode: "SKILL_NOT_MATCHED" });
      }
      const declinedAt = new Date();
      const declined = await HelpRequest.findOneAndUpdate(
        { _id: current._id, status: "pending" },
        {
          $push: {
            offerAttempts: {
              volunteerId: lookup.user._id,
              result: "declined",
              startedAt: declinedAt,
              endedAt: declinedAt,
            },
          },
        },
        { new: true },
      );
      if (!declined) {
        return res.status(409).json({ errorCode: "INVALID_STATUS_TRANSITION" });
      }
      const existingDecline = await Activity.findOne({
        type: "help_request_offer_declined",
        userId: lookup.user._id,
        relatedRequestId: declined._id,
      }).select("_id");
      if (!existingDecline) {
        await recordActivity({
          type: "help_request_offer_declined",
          userId: lookup.user._id,
          relatedRequestId: declined._id,
        });
      }
      const populated = await HelpRequest.findById(declined._id)
        .populate("serviceId", "name nameAr")
        .populate("serviceIds", "name nameAr");
      return res.status(200).json({
        messageCode: "OFFER_DECLINED",
        request: toPublicHelpRequest(populated, false),
      });
    }

    if (req.body.status === "accepted") {
      if (current.status !== "pending") {
        return res.status(409).json({ errorCode: "INVALID_STATUS_TRANSITION" });
      }
      if (!skillMatch) {
        return res.status(403).json({ errorCode: "SKILL_NOT_MATCHED" });
      }
      const claimed = await claimVolunteerRequest(lookup.user._id, current._id);
      if (!claimed) {
        return res.status(409).json({ errorCode: "VOLUNTEER_HAS_ACTIVE_REQUEST" });
      }
      const acceptedAt = new Date();
      const accepted = await HelpRequest.findOneAndUpdate(
        { _id: current._id, status: "pending" },
        {
          $set: {
            status: "accepted",
            volunteerId: lookup.user._id,
            acceptedAt,
            reminderSent: false,
          },
        },
        { new: true },
      );
      if (!accepted) {
        await releaseVolunteerRequest(lookup.user._id, current._id);
        const latest = await HelpRequest.findById(current._id).select("status");
        if (latest?.status === "cancelled") {
          return res.status(409).json({ errorCode: "REQUEST_CANCELLED" });
        }
        return res.status(409).json({ errorCode: "INVALID_STATUS_TRANSITION" });
      }

      await createNotifications([
        withRequestNumber({
          userId: accepted.userId,
          type: "help_request_accepted",
          relatedRequestId: accepted._id,
        }, accepted),
        withRequestNumber({
          userId: lookup.user._id,
          type: "help_request_assigned",
          relatedRequestId: accepted._id,
        }, accepted),
      ]);
      await recordActivity({
        type: "help_request_accepted",
        userId: lookup.user._id,
        relatedRequestId: accepted._id,
      });
      await publishRequestLifecycle(accepted, "accepted");

      const populated = await HelpRequest.findById(accepted._id)
        .populate("serviceId", "name nameAr")
        .populate("serviceIds", "name nameAr")
        .populate("volunteerId", "fullName");
      return res.status(200).json({
        messageCode: "REQUEST_ACCEPTED",
        request: toPublicHelpRequest(populated, true),
      });
    }

    return res.status(409).json({ errorCode: "INVALID_STATUS_TRANSITION" });
  } catch (error) {
    console.error("Update help request failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

const readFeedbackComment = (value) => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length < 5 || text.length > 400) return null;
  return text;
};

app.post("/api/feedback", async (req, res) => {
  try {
    const lookup = await findAccount(req.body.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (!isNormalUser(lookup.user)) {
      return res.status(403).json({ errorCode: "NOT_ALLOWED" });
    }

    if (!mongoose.isValidObjectId(req.body.helpRequestId)) {
      return res.status(400).json({ errorCode: "INVALID_REQUEST_ID" });
    }

    const rating = readRating(req.body.rating);
    if (rating == null) {
      return res.status(400).json({ errorCode: "INVALID_RATING" });
    }

    const comment = readFeedbackComment(req.body.comment);
    if (!comment) {
      return res.status(400).json({ errorCode: "INVALID_FEEDBACK" });
    }

    const request = await HelpRequest.findById(req.body.helpRequestId);
    if (!request) {
      return res.status(404).json({ errorCode: "REQUEST_NOT_FOUND" });
    }

    if (request.userId.toString() !== lookup.user._id.toString()) {
      return res.status(403).json({ errorCode: "NOT_ALLOWED" });
    }

    if (request.status !== "completed") {
      return res.status(409).json({ errorCode: "REQUEST_NOT_COMPLETED" });
    }

    if (!request.volunteerId) {
      return res.status(409).json({ errorCode: "REQUEST_HAS_NO_VOLUNTEER" });
    }

    const existing = await Feedback.findOne({
      helpRequestId: request._id,
    }).select("_id");
    if (existing) {
      return res.status(409).json({ errorCode: "FEEDBACK_ALREADY_SUBMITTED" });
    }

    const feedback = await Feedback.create({
      userId: lookup.user._id,
      volunteerId: request.volunteerId,
      helpRequestId: request._id,
      rating,
      comment,
    });

    const admins = await User.find({
      role: "admin",
      accountStatus: { $ne: "blocked" },
    }).select("_id").lean();
    const priorFeedbackNotices = await Notification.find({
      relatedRequestId: request._id,
      type: "feedback_submitted",
    }).select("userId").lean();
    const alreadyNotified = new Set(
      priorFeedbackNotices.map((item) => String(item.userId || "")).filter(Boolean),
    );
    const feedbackNotices = [];
    const volunteerId = String(request.volunteerId || "");
    if (volunteerId && !alreadyNotified.has(volunteerId)) {
      feedbackNotices.push(withRequestNumber({
        userId: request.volunteerId,
        type: "feedback_submitted",
        relatedRequestId: request._id,
      }, request));
      alreadyNotified.add(volunteerId);
    }
    for (const admin of admins) {
      const adminId = String(admin._id || "");
      if (!adminId || alreadyNotified.has(adminId)) continue;
      feedbackNotices.push(withRequestNumber({
        userId: admin._id,
        type: "feedback_submitted",
        relatedRequestId: request._id,
      }, request));
      alreadyNotified.add(adminId);
    }
    const feedbackNotified = await createNotifications(feedbackNotices);
    if (!feedbackNotified) {
      console.error("Feedback notifications were not saved:", {
        requestId: String(request._id),
      });
    }
    await recordActivity({
      type: "feedback_submitted",
      userId: lookup.user._id,
      relatedRequestId: request._id,
    });

    return res.status(201).json({
      messageCode: "FEEDBACK_SUBMITTED",
      feedback: {
        id: feedback._id.toString(),
        helpRequestId: request._id.toString(),
        rating: feedback.rating,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ errorCode: "FEEDBACK_ALREADY_SUBMITTED" });
    }

    console.error("Create feedback failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

const buildRatingSummary = async (volunteerId) => {
  const match = volunteerId ? [{ $match: { volunteerId } }] : [];
  const [summary] = await Feedback.aggregate([
    ...match,
    {
      $facet: {
        overall: [
          {
            $group: {
              _id: null,
              averageRating: { $avg: "$rating" },
              ratingCount: { $sum: 1 },
            },
          },
        ],
        volunteers: [
          {
            $group: {
              _id: "$volunteerId",
              averageRating: { $avg: "$rating" },
              ratingCount: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "_id",
              foreignField: "_id",
              as: "volunteer",
            },
          },
          {
            $project: {
              _id: 0,
              volunteerId: "$_id",
              volunteerName: {
                $ifNull: [{ $arrayElemAt: ["$volunteer.fullName", 0] }, ""],
              },
              averageRating: 1,
              ratingCount: 1,
            },
          },
          { $sort: { volunteerName: 1 } },
        ],
      },
    },
  ]);

  const overall = summary?.overall?.[0];
  return {
    overall: {
      averageRating: overall?.ratingCount ? overall.averageRating : null,
      ratingCount: overall?.ratingCount || 0,
    },
    volunteers: summary?.volunteers || [],
  };
};

app.get("/api/feedback/summary", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (!isApprovedVolunteer(lookup.user)) {
      return res.status(403).json({ errorCode: "NOT_ALLOWED" });
    }

    const summary = await buildRatingSummary(lookup.user._id);
    return res.status(200).json(summary.overall);
  } catch (error) {
    console.error("Fetch volunteer rating summary failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/feedback/my", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (lookup.user.role !== "user") {
      return res.status(403).json({ errorCode: "NOT_ALLOWED" });
    }

    const feedbacks = await Feedback.find({ userId: lookup.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      feedbacks: feedbacks.map((feedback) => ({
        id: feedback._id.toString(),
        helpRequestId: feedback.helpRequestId.toString(),
        rating: feedback.rating,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
      })),
    });
  } catch (error) {
    console.error("Fetch my feedback failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/feedback", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (lookup.user.role !== "admin") {
      return res.status(403).json({ errorCode: "NOT_ALLOWED" });
    }

    const [feedbacks, summary] = await Promise.all([
      Feedback.find()
        .sort({ createdAt: -1 })
        .populate("userId", "fullName")
        .populate("volunteerId", "fullName")
        .populate({
          path: "helpRequestId",
          select: "serviceId serviceIds",
          populate: [
            { path: "serviceId", select: "name nameAr" },
            { path: "serviceIds", select: "name nameAr" },
          ],
        })
        .lean(),
      buildRatingSummary(),
    ]);

    return res.status(200).json({
      summary,
      feedbacks: feedbacks.map((feedback) => ({
        id: feedback._id.toString(),
        userName: feedback.userId?.fullName || "",
        volunteerName: feedback.volunteerId?.fullName || "",
        serviceName: feedback.helpRequestId
          ? requestServiceName(feedback.helpRequestId)
          : "",
        serviceNameAr: feedback.helpRequestId
          ? requestServiceNameAr(feedback.helpRequestId)
          : "",
        rating: feedback.rating,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
      })),
    });
  } catch (error) {
    console.error("Fetch feedback failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

const APPLICATION_ACTIVITY_TYPES = [
  "volunteer_application_submitted",
  "volunteer_application_approved",
  "volunteer_application_rejected",
];

const REQUEST_ACTIVITY_TYPES = [
  "help_request_created",
  "help_request_accepted",
  "help_request_started",
  "help_request_cancelled",
  "help_request_completed",
  "help_request_assignment_expired",
  "help_request_offer_declined",
  "feedback_submitted",
];

const toPublicActivity = (activity) => ({
  id: activity._id.toString(),
  type: activity.type,
  createdAt: activity.createdAt,
});

app.get("/api/activity", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    if (lookup.user.role === "admin") {
      const activities = await Activity.find()
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

      return res.status(200).json({
        activities: activities.map(toPublicActivity),
      });
    }

    const relatedRequests = await HelpRequest.find(
      isApprovedVolunteer(lookup.user)
        ? { volunteerId: lookup.user._id }
        : { userId: lookup.user._id },
    )
      .select("_id")
      .lean();

    const activities = await Activity.find({
      $or: [
        {
          userId: lookup.user._id,
          type: { $in: APPLICATION_ACTIVITY_TYPES },
        },
        {
          userId: lookup.user._id,
          type: "help_request_assignment_expired",
        },
        {
          relatedRequestId: { $in: relatedRequests.map((request) => request._id) },
          type: { $in: REQUEST_ACTIVITY_TYPES },
        },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    return res.status(200).json({
      activities: activities.map(toPublicActivity),
    });
  } catch (error) {
    console.error("Fetch activity failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.get("/api/notifications", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    const notifications = await Notification.find({
      userId: lookup.user._id,
      createdAt: { $gte: new Date(Date.now() - NOTIFICATION_RETENTION_MS) },
    })
      .sort({ createdAt: -1 })
      .lean();

    const requestIds = [...new Set(
      notifications.map((item) => item.relatedRequestId).filter(Boolean).map(String),
    )];
    const relatedRequests = requestIds.length
      ? await HelpRequest.find({ _id: { $in: requestIds } }).select("status").lean()
      : [];
    const statusById = new Map(
      relatedRequests.map((request) => [String(request._id), request.status]),
    );

    return res.status(200).json({
      notifications: notifications.map((notification) => toPublicNotification(
        notification,
        notification.relatedRequestId
          ? statusById.get(String(notification.relatedRequestId))
          : null,
      )),
    });
  } catch (error) {
    console.error("Fetch notifications failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.delete("/api/notifications", async (req, res) => {
  try {
    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    const result = await Notification.deleteMany({ userId: lookup.user._id });

    return res.status(200).json({
      messageCode: "NOTIFICATIONS_DELETED",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Delete notifications failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

app.delete("/api/notifications/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ errorCode: "INVALID_NOTIFICATION_ID" });
    }

    const lookup = await findAccount(req.query.userId);
    if (!lookup.user) {
      return res.status(lookup.status).json({ errorCode: lookup.errorCode });
    }

    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: lookup.user._id,
    });

    if (!notification) {
      return res.status(404).json({ errorCode: "NOTIFICATION_NOT_FOUND" });
    }

    return res.status(200).json({ messageCode: "NOTIFICATION_DELETED" });
  } catch (error) {
    console.error("Delete notification failed:", error);
    return res.status(500).json({ errorCode: "SERVER_ERROR" });
  }
});

const ensureNotificationTtlIndex = async () => {
  const indexes = await Notification.collection.indexes();
  const existing = indexes.find((index) => index.key?.createdAt === 1);
  if (!existing) {
    await Notification.collection.createIndex(
      { createdAt: 1 },
      { name: "notifications_createdAt_ttl", expireAfterSeconds: 2592000 },
    );
    return;
  }

  if (existing.expireAfterSeconds === 2592000) return;

  await mongoose.connection.db.command({
    collMod: Notification.collection.collectionName,
    index: {
      name: existing.name,
      expireAfterSeconds: 2592000,
    },
  });
};

const startServer = async () => {
  try {
    await mongoose.connect(readEnv("MONGODB_URI"));

    console.log("MongoDB connected");
    await ensureNotificationTtlIndex();
    await backfillRequestNumbers();
    processAcceptanceTimeouts();
    setInterval(() => {
      processAcceptanceTimeouts();
    }, TIMEOUT_CHECK_MS);

    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
};

startServer();

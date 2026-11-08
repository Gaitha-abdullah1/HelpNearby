import ThemeToggle from "./ThemeToggle";
import LanguageToggle from "./LanguageToggle";

const Navbar = ({ dashboardTitle, children }) => {
  return (
    <nav className={`navbar${dashboardTitle ? " dashboard-navbar" : ""}`}>
      {dashboardTitle && <h1 className="dashboard-navbar-title">{dashboardTitle}</h1>}
      <div className="navbar-buttons">
        {children}
        <ThemeToggle />
        <LanguageToggle />
      </div>
    </nav>
  );
};

export default Navbar;

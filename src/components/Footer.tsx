// src/components/Footer.tsx
export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-loader">
        <div className="spinner">
          {/* восемь точек, образующих кольцо */}
          <div></div><div></div><div></div><div></div>
          <div></div><div></div><div></div><div></div>
        </div>
      </div>
      <div className="footer-links">
        <a href="#">Log In</a>
        <a href="#">About Us</a>
        <a href="#">Publishers</a>
        <a href="#">Sitemap</a>
      </div>
      <div className="powered-by">
        Powered by <span className="news-api-logo">News API</span>
      </div>
      <div className="copyright">
        © 2023 Besider. Inspired by Insider
      </div>
    </footer>
  );
}

import { FaInstagram, FaWhatsapp } from 'react-icons/fa'

const WHATSAPP_NUMBER = '554891988246'
const INSTAGRAM_HANDLE = 'andersentrader'

export default function Footer() {
  return (
    <footer className="app-footer">
      <span className="footer-copyright">© {new Date().getFullYear()} BinAI. Todos os direitos reservados.</span>
      <div className="footer-links">
        <a
          className="footer-link footer-whatsapp"
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <FaWhatsapp /> WhatsApp
        </a>
        <a
          className="footer-link footer-instagram"
          href={`https://instagram.com/${INSTAGRAM_HANDLE}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <FaInstagram /> @{INSTAGRAM_HANDLE}
        </a>
      </div>
    </footer>
  )
}

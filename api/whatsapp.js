// Redirección privada a WhatsApp.
// El número vive SOLO en la variable de entorno WHATSAPP_NUMBER de Vercel
// (nunca en el HTML, el JS ni el repositorio). El visitante pulsa el botón
// y WhatsApp se abre directamente, como con un enlace wa.me clásico.
export default function handler(req, res) {
  const number = process.env.WHATSAPP_NUMBER;
  if (!number) {
    return res.status(500).send("WhatsApp no configurado");
  }
  const q = req.query || {};
  const text = typeof q.text === "string" ? q.text.slice(0, 600) : "";
  const url =
    "https://wa.me/" +
    number +
    (text ? "?text=" + encodeURIComponent(text) : "");
  res.writeHead(302, { Location: url, "Cache-Control": "no-store" });
  res.end();
}

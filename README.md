# Astro Starter Kit: Minimal

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## 🤖 Asistente virtual con IA

El sitio incluye un asistente de chat (`src/components/AsistenteIA.astro`) que responde preguntas de los visitantes usando la API de Gemini a través de la función serverless `api/chat.js`.

### Configurar `GEMINI_API_KEY` en Vercel

1. Obtenga una clave en [Google AI Studio](https://aistudio.google.com/apikey) (plan gratuito disponible).
2. En el panel de Vercel: seleccione el proyecto → **Settings → Environment Variables**.
3. Agregue la variable `GEMINI_API_KEY` con el valor de la clave, para los entornos **Production** (y Preview si lo desea).
4. Haga un nuevo despliegue (redeploy) para que la variable quede activa.

### Comportamiento sin la variable

Si `GEMINI_API_KEY` no está configurada, el asistente muestra automáticamente un mensaje que deriva al visitante al WhatsApp (+57 317 483 2132). El sitio funciona con normalidad en todo lo demás.

### Seguridad

- La clave vive solo como variable de entorno del servidor; **nunca** se expone en el código del navegador.
- El asistente tiene instrucciones de no pedir contraseñas ni datos sensibles y de no inventar precios ni servicios.

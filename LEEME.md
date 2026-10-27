# Estratega de Reels — versión para Render

Esta es la misma interfaz del Estratega de Reels, pero preparada para publicarla en Render con un link propio. Funciona sin ninguna cuenta de Claude: los guiones los escribe Gemini (Google) con una clave gratuita.

## Qué hay en la carpeta

- `index.html` → la página (formulario, semana de 5 guiones, análisis de resultados).
- `server.js` → un servidor chiquito que muestra la página y le pasa los pedidos a Gemini. La clave queda guardada en Render, no en la página, así nadie la puede ver.
- `package.json` → le dice a Render cómo arrancar el servidor.

## Paso 1 — Sacar la clave gratis de Gemini

1. Entrá a **aistudio.google.com** con una cuenta de Google.
2. Tocá **"Get API key"** y después **"Create API key"**.
3. Copiá la clave (empieza con `AIza…`). No la compartas ni la pegues en la página.

## Paso 2 — Subir la carpeta a GitHub

1. En **github.com**, tocá **"New repository"**, poné un nombre (ej. `estratega-de-reels`) y tocá **Create repository**.
2. Tocá **"uploading an existing file"**.
3. Abrí la carpeta `estratega-render`, seleccioná los 4 archivos (`index.html`, `server.js`, `package.json` y `LEEME.md`) con **Cmd + A** y arrastralos a la página de GitHub. Funciona en Safari, Chrome o cualquier navegador.
4. Tocá **"Commit changes"**.

Revisá que en GitHub se vean los 4 archivos.

## Paso 3 — Crear el servicio en Render

1. En **render.com**, entrá con tu cuenta de GitHub.
2. Tocá **"New +"** y elegí **Web Service** (no "Static Site").
3. Elegí el repositorio `estratega-de-reels`.
4. Completá así:
   - **Language / Runtime:** `Node`
   - **Build Command:** `npm install` (en minúscula, con un espacio entre `npm` e `install`)
   - **Start Command:** `npm start` (con un espacio entre `npm` y `start`)
   - **Instance Type:** `Free`
5. En **Environment Variables**, tocá **"Add Environment Variable"**:
   - **Key:** `GEMINI_API_KEY` (todo junto, con guiones bajos y sin espacios)
   - **Value:** la clave que copiaste en el paso 1
6. Tocá **"Deploy Web Service"**. En unos minutos te da un link tipo `estratega-de-reels.onrender.com`.

## Para el día de la demo

- **El plan gratis de Render "se duerme"** si nadie usa la página durante 15 minutos. La primera vez que la abrís tarda cerca de un minuto en despertar. **Abrila unos 5 minutos antes de pasar al frente.**
- Usá **"Completar con un ejemplo (Mosca Hnos)"** para tener datos listos.
- El plan gratis de Gemini tiene un límite de pedidos por minuto y por día. Para una demo sobra. Si aparece un mensaje de "esperá un minuto", es eso.

## Si algo falla

- **Aparece "falta configurar la clave de la IA":** revisá en Render, dentro de *Environment*, que la variable se llame exactamente `GEMINI_API_KEY`.
- **Aparece "la clave de la IA no es válida":** volvé a copiar la clave desde AI Studio y reemplazala en Render.
- **Aparece "el modelo de IA configurado no existe":** Google cambia los nombres de los modelos cada tanto. En AI Studio fijate cuál es el modelo "Flash" gratuito actual y agregá en Render otra variable: **Key** `GEMINI_MODEL`, **Value** el nombre del modelo (ej. `gemini-2.5-flash`). Por defecto usa `gemini-2.5-flash`.

Cada vez que cambies un archivo en GitHub, Render publica la versión nueva solo.

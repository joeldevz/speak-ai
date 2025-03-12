import { Application, Router, Request, Response,send } from "https://deno.land/x/oak/mod.ts";
import { multiParser } from 'https://deno.land/x/multiparser/mod.ts'

const API_KEY = "sk_4320af543747f76684a97a1e8a4d4556a555bb41f64be0e2";
const UPLOAD_PATH = "./uploads/";
const PUBLIC_PATH = "./public/";

// Crear el directorio de uploads si no existe
await Deno.mkdir(UPLOAD_PATH, { recursive: true });

const router = new Router();
router.get("/", async (ctx) => {
    console.log(ctx.request.url.pathname);
    await send(ctx, "index.html", { root: PUBLIC_PATH });
});

router.post("/clone-voice", async (ctx) => {
    try {
        const form = await multiParser(ctx.request.originalRequest.request);

        if (!form || !form.files || !form.files.file) {
            ctx.response.status = 400;
            ctx.response.body = { error: "No se encontró el archivo de audio" };
            return;
        }

        const file: FormFile = form.files.file as FormFile;
        const filePath = `${UPLOAD_PATH}${file.filename}`;

        // Guardar el archivo
        await Deno.writeFile(filePath, file.content!);

        // Enviar a ElevenLabs para clonar la voz
        const formData = new FormData();
        formData.append("name", "Mi_Voz");
        formData.append("files", new Blob([file.content!], { type: "audio/mpeg" }), file.filename);

        const elevenLabsResponse = await fetch("https://api.elevenlabs.io/v1/voices/add", {
            method: "POST",
            headers: { "xi-api-key": API_KEY },
            body: formData
        });

        const result = await elevenLabsResponse.json();
        ctx.response.body = { message: "Voz clonada", voice_id: result.voice_id };
    } catch (error) {
        console.log(error);
        ctx.response.status = 500;
        ctx.response.body = { error: error.message };
    }
});

// 📌 Endpoint 2: Generar audio con la voz clonada
router.post("/text-to-speech", async (ctx) => {
    try {
        const { voice_id, text } = await ctx.request.body.json();

        if (!voice_id || !text) {
            ctx.response.status = 400;
            ctx.response.body = { error: "voice_id y text son requeridos" };
            return;
        }

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "xi-api-key": API_KEY
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_multilingual_v2",
                voice_settings: { stability: 0.5, similarity_boost: 0.5 }
            })
        });

        if (!response.ok) {
            ctx.response.status = 500;
            ctx.response.body = { error: await response.text() };
            return;
        }

        const audioData = await response.arrayBuffer();
        const outputFile = `${UPLOAD_PATH}output.mp3`;

        await Deno.writeFile(outputFile, new Uint8Array(audioData));
        ctx.response.body = { message: "Audio generado", url: `http://localhost:8005/audio/output.mp3` };
    } catch (error) {
        console.log(error);
        ctx.response.status = 500;
        ctx.response.body = { error: error.message };
    }
});

// 📌 Servir archivos de audio
router.get("/audio/:filename", async (ctx) => {
    try {
        const filename = ctx.params.filename;
        const filePath = `${UPLOAD_PATH}${filename}`;
        console.log(filePath);
        await Deno.stat(filePath);
        ctx.response.type = "audio/mp3";
        ctx.response.body = await Deno.open(filePath);
    } catch (err){
        console.log(err);
        ctx.response.status = 404;
        ctx.response.body = { error: "Archivo no encontrado" };
    }
});

// 📌 Configurar y correr el servidor
const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

console.log("Servidor corriendo en http://localhost:8000");
await app.listen({ port: 8005 });

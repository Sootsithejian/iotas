import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import mqtt from "mqtt";
import { WebSocketServer } from "ws";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../../frontend")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

async function obtener_lugares() {
  const lugares = await prisma.lugar.findMany({
    orderBy: { id: "asc" },
    include: {
      reservaciones: {
        where: { estado: "activa", expiraEn: { gt: new Date() } },
      },
    },
  });
  return lugares.map(({ reservaciones, ...l }) => ({
    ...l,
    reservado: reservaciones.length > 0,
  }));
}

async function broadcast_lugares() {
    const msg = JSON.stringify({ tipo: "lugares", lugares: await obtener_lugares() });
    wss.clients.forEach((c) => c.readyState === 1 && c.send(msg))
}

wss.on("connection", async (ws) => {
    ws.send(JSON.stringify({ tipo: "lugares", lugares: await obtener_lugares()}));
});

/* Mqtt */
const client = mqtt.connect(process.env.MQTT_URL);

client.on("connect", () => {
    console.log("TA BIEN");
    client.subscribe("estacionamiento/sensores/+/estado");
});

client.on("error", (e) => console.error("Error:", e.message));

client.on("message", async (topic, payload) => {
    try {
        const mac = topic.split("/")[2].toUpperCase();
        const ocupado = payload.toString().trim() === "ocupado";

        const disp = await prisma.dispositivoSensor.findUnique({
            where: { mac }
        });
        if(!disp || !disp.activo) { 
            console.log("mac no registrada", mac);
            return;
        }
        await prisma.lugar.update({
            where: { id: disp.lugarId},
            data: { ocupado, ultimaLectura: new Date()},
        });
        console.log(`Lugar ${disp.lugarId} -> ${ocupado? "ocupado" : "libre"}`);
        await broadcast_lugares();
    } catch (e) {
        console.error(e);
    }
});

/* HTTP */

app.get("/lugares", async(_req,res) => res.json(await obtener_lugares()));

app.post("/reservaciones", async (req,res) => {
    const lugar_id = Number(req.body.lugarId);
    const cliente_id = String(req.body.cliente_id || "anonimo");

    const lugar = await prisma.lugar.findUnique({
        where:{ id: lugar_id},
    });
    if (!lugar) return res.status(404).json({ error: "No existe"});
    if (!lugar.ocupado) return res.status(409).json({ error: "Esta ocupado"});

    const activa = await prisma.reservacion.findFirst({
        where: { lugar_id, estado: "activa", expiraEn: {gt: new Date()}},
    });
    if (activa) return res.status(409).json({ error: "reservado"});

    const r = await prisma.reservacion.create({
        data: { lugar_id, cliente_id, expiraEn: new Date(Date.now() + 15 * 60 * 1000)},
    });
    await broadcast_lugares();
    res.status(201).json(r);
});

server.listen(process.env.PORT || 3000, () => 
    console.log(`Servidor en http://localhost:${process.env.PORT || 3000}`)
)
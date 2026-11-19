import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient();


const dispotivos_mac = [
    { mac: "D4:E9:F4:77:E2:58", lugarId: 1},
    { mac: "8C:94:DF:90:D6:4C", lugarId: 2},
    { mac: "8C:94:DF:48:20:60", lugarId: 3},
    { mac: "F0:24:F9:0C:68:04", lugarId: 4},
    { mac: "70:4B:CA:8F:22:40", lugarId: 5},
    { mac: "B0:CB:D8:E8:EA:EC", lugarId: 6},

];

const pisos = 2;
const por_piso = 3;



for (let nivel = 1; nivel <= pisos; nivel++) {
  for (let numero = 1; numero <= por_piso; numero++) {
    const id = (nivel - 1) * por_piso + numero;
    await prisma.lugar.upsert({
      where: { id },
      update: { nivel, numero },   
      create: { id, nivel, numero },
    });
  }
}

for (const d of dispotivos_mac) {
    await prisma.dispositivoSensor.upsert({
        where: { mac: d.mac},
        update: {lugarId: d.lugarId, activo: true},
        create: d,
    });
}

console.log("Seed Listo");
await prisma.$disconnect();


'use strict';

/**
 * Cliente de prueba gRPC: ejecuta TODOS los metodos (Create, Get, List, Update, Delete
 * y el ciclo de vida de reservaciones) contra el servidor.
 *
 * Uso:
 *   docker compose exec grpc-api npm run client
 *   GRPC_TARGET=localhost:50051 node src/client.js   (desde el host, con Node instalado)
 */

const { cargarProto, grpc } = require('./protoLoader');

const TARGET = process.env.GRPC_TARGET || 'localhost:50051';
const ADMIN = { email: process.env.TEST_EMAIL || 'admin@lacasadelanana.mx', password: process.env.TEST_PASSWORD || 'Admin12345' };

const nana = cargarProto();
const cred = grpc.credentials.createInsecure();
const clientes = {
  auth: new nana.AuthService(TARGET, cred),
  habitaciones: new nana.HabitacionService(TARGET, cred),
  mascotas: new nana.MascotaService(TARGET, cred),
  reservaciones: new nana.ReservacionService(TARGET, cred)
};

let metadata = new grpc.Metadata();
let exitos = 0;
let fallos = 0;

const MS_DIA = 86400000;
const fecha = (dias) => new Date(Date.now() + dias * MS_DIA).toISOString().slice(0, 10);

function llamar(cliente, metodo, req) {
  return new Promise((resolve, reject) => {
    cliente[metodo](req, metadata, { deadline: Date.now() + 15000 }, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

async function paso(titulo, fn) {
  try {
    const r = await fn();
    exitos += 1;
    console.log(`  ✔ ${titulo}${r ? `  ->  ${r}` : ''}`);
  } catch (err) {
    fallos += 1;
    console.log(`  ✘ ${titulo}  ->  [${grpc.status[err.code] || err.code}] ${err.details || err.message}`);
  }
}

/** Paso donde el error ES el resultado esperado (regla de negocio). */
async function pasoEsperandoError(titulo, codigo, fn) {
  try {
    await fn();
    fallos += 1;
    console.log(`  ✘ ${titulo}  ->  se esperaba error ${grpc.status[codigo]} y no ocurrió`);
  } catch (err) {
    if (err.code === codigo) {
      exitos += 1;
      console.log(`  ✔ ${titulo}  ->  rechazado como se esperaba [${grpc.status[err.code]}] ${err.details}`);
    } else {
      fallos += 1;
      console.log(`  ✘ ${titulo}  ->  código inesperado [${grpc.status[err.code] || err.code}] ${err.details || err.message}`);
    }
  }
}

async function main() {
  console.log(`\n=== Cliente gRPC - La Casa de la Nana (${TARGET}) ===\n`);
  const ctx = {};

  console.log('[AuthService]');
  await pasoEsperandoError('Login con contraseña incorrecta', grpc.status.UNAUTHENTICATED,
    () => llamar(clientes.auth, 'Login', { email: ADMIN.email, password: 'incorrecta' }));
  await pasoEsperandoError('List sin token', grpc.status.UNAUTHENTICATED,
    () => llamar(clientes.habitaciones, 'List', {}));
  await paso('Login ADMIN', async () => {
    const r = await llamar(clientes.auth, 'Login', ADMIN);
    metadata = new grpc.Metadata();
    metadata.set('authorization', `Bearer ${r.token}`);
    return `${r.usuario.nombre} (${r.usuario.rol})`;
  });

  console.log('\n[HabitacionService]');
  await paso('List (todas)', async () => {
    const r = await llamar(clientes.habitaciones, 'List', {});
    const porZona = r.items.reduce((acc, h) => ({ ...acc, [h.zona]: (acc[h.zona] || 0) + 1 }), {});
    ctx.habitaciones = r.items;
    return `${r.total} habitaciones ${JSON.stringify(porZona)}`;
  });
  await paso('List (zona VIP)', async () => {
    const r = await llamar(clientes.habitaciones, 'List', { zona: 'VIP' });
    return r.items.map((h) => h.numero).join(', ');
  });
  await paso('Get (primera habitación)', async () => {
    const h = await llamar(clientes.habitaciones, 'Get', { id: ctx.habitaciones[0].id });
    return `${h.numero} | ${h.zona} | $${h.precioNoche}/noche | ${h.estado}`;
  });
  await pasoEsperandoError('Create con 29 habitaciones existentes (regla de máximo físico)', grpc.status.FAILED_PRECONDITION,
    () => llamar(clientes.habitaciones, 'Create', { numero: 'VIP-07', zona: 'VIP', capacidad: 2, precioNoche: 900 }));

  const vip06 = ctx.habitaciones.find((h) => h.numero === 'VIP-06');
  if (vip06) {
    await paso('Delete VIP-06 (libera un lugar: 28)', async () => (await llamar(clientes.habitaciones, 'Delete', { id: vip06.id })).mensaje);
    await paso('Create VIP-06 de nuevo (vuelve a 29)', async () => {
      const h = await llamar(clientes.habitaciones, 'Create', {
        numero: 'VIP-06', zona: 'VIP', capacidad: vip06.capacidad, precioNoche: vip06.precioNoche, amenidades: vip06.amenidades
      });
      ctx.vip06 = h;
      return `${h.numero} creada con id ${h.id}`;
    });
  }
  await paso('Update (precio y notas de VIP-06)', async () => {
    const h = await llamar(clientes.habitaciones, 'Update', { id: ctx.vip06.id, data: { precioNoche: 880, notas: 'Precio ajustado desde cliente gRPC' } });
    return `${h.numero} ahora $${h.precioNoche}/noche, amenidades conservadas: ${h.amenidades.length}`;
  });
  await pasoEsperandoError('Get con id inexistente', grpc.status.NOT_FOUND,
    () => llamar(clientes.habitaciones, 'Get', { id: '000000000000000000000000' }));

  console.log('\n[MascotaService]');
  await paso('List (todas)', async () => {
    const r = await llamar(clientes.mascotas, 'List', {});
    ctx.mascotas = r.items;
    return r.items.map((x) => `${x.nombre}${x.estadoVacunas.vigentes ? '' : ' (vacunas pendientes)'}`).join(', ');
  });
  const max = (ctx.mascotas || []).find((x) => x.nombre === 'Max');
  const toby = (ctx.mascotas || []).find((x) => x.nombre === 'Toby');
  await paso('Create (nueva mascota para el tutor de Max)', async () => {
    const vence = fecha(365);
    const x = await llamar(clientes.mascotas, 'Create', {
      nombre: `Firulais gRPC ${Date.now().toString().slice(-4)}`,
      raza: 'Labrador', sexo: 'MACHO', edad: 5, pesoKg: 28, tamano: 'GRANDE', tutorId: max.tutorId,
      vacunas: ['Rabia', 'Múltiple', 'Bordetella'].map((nombre) => ({ nombre, fechaAplicacion: fecha(-10), fechaVencimiento: vence }))
    });
    ctx.mascota = x;
    return `${x.nombre} (id ${x.id}) | vacunas vigentes: ${x.estadoVacunas.vigentes}`;
  });
  await paso('Get', async () => {
    const x = await llamar(clientes.mascotas, 'Get', { id: ctx.mascota.id });
    return `${x.nombre} | tutor: ${x.tutorNombre} | ${x.pesoKg} kg`;
  });
  await paso('Update (peso y alergias)', async () => {
    const x = await llamar(clientes.mascotas, 'Update', { id: ctx.mascota.id, data: { pesoKg: 29.5, alergias: ['Res'], reemplazarAlergias: true } });
    return `${x.pesoKg} kg | alergias: ${x.alergias.join(', ')} | vacunas conservadas: ${x.vacunas.length}`;
  });
  await paso('List (filtro por nombre "Firulais")', async () => `${(await llamar(clientes.mascotas, 'List', { nombre: 'Firulais' })).total} coincidencia(s)`);

  console.log('\n[ReservacionService]');
  const entrada = fecha(30);
  const salida = fecha(33);
  await paso('Cotizar (VIP, 3 noches + baño)', async () => {
    const c = await llamar(clientes.reservaciones, 'Cotizar', { mascotaId: ctx.mascota.id, zona: 'VIP', fechaEntrada: entrada, fechaSalida: salida, servicios: ['BANO'] });
    return `${c.habitacionNumero}: ${c.noches} noches x $${c.precioNoche} + servicios $${c.subtotalServicios} = $${c.total}`;
  });
  await paso('Create (confirmada)', async () => {
    const r = await llamar(clientes.reservaciones, 'Create', { mascotaId: ctx.mascota.id, zona: 'VIP', fechaEntrada: entrada, fechaSalida: salida, servicios: ['BANO'] });
    ctx.reservacion = r;
    return `${r.folio} | ${r.estado} | hab ${r.habitacionNumero} | total $${r.total}`;
  });
  await paso('Get', async () => {
    const r = await llamar(clientes.reservaciones, 'Get', { id: ctx.reservacion.id });
    return `${r.folio} | ${r.mascotaNombre} | saldo $${r.saldo}`;
  });
  await paso('Update (agrega paseo extra, recalcula)', async () => {
    const r = await llamar(clientes.reservaciones, 'Update', { id: ctx.reservacion.id, data: { servicios: ['BANO', 'PASEO'], reemplazarServicios: true, notas: 'Agregar paseo vespertino' } });
    return `servicios: ${r.servicios.map((s) => s.clave).join('+')} | total $${r.total}`;
  });
  await paso('List (estado CONFIRMADA)', async () => `${(await llamar(clientes.reservaciones, 'List', { estado: 'CONFIRMADA' })).total} reservación(es)`);
  await pasoEsperandoError('CheckIn sin validación médica (debe fallar)', grpc.status.FAILED_PRECONDITION,
    () => llamar(clientes.reservaciones, 'CheckIn', { id: ctx.reservacion.id }));
  await paso('ValidarMedica', async () => (await llamar(clientes.reservaciones, 'ValidarMedica', { id: ctx.reservacion.id, nota: 'Cartilla revisada' })).estado);
  await paso('CheckIn', async () => (await llamar(clientes.reservaciones, 'CheckIn', { id: ctx.reservacion.id, nota: 'Llegó con correa roja' })).estado);
  await pasoEsperandoError('CheckOut con saldo pendiente (debe fallar)', grpc.status.FAILED_PRECONDITION,
    () => llamar(clientes.reservaciones, 'CheckOut', { id: ctx.reservacion.id }));
  await paso('RegistrarPago (liquida saldo con tarjeta)', async () => {
    const actual = await llamar(clientes.reservaciones, 'Get', { id: ctx.reservacion.id });
    const r = await llamar(clientes.reservaciones, 'RegistrarPago', { id: ctx.reservacion.id, monto: actual.saldo, metodo: 'TARJETA', referencia: 'TPV-0001' });
    return `pagado $${r.pagado} | saldo $${r.saldo}`;
  });
  await paso('CheckOut', async () => (await llamar(clientes.reservaciones, 'CheckOut', { id: ctx.reservacion.id, nota: 'Entregado a su tutor' })).estado);

  if (toby) {
    const conf = await llamar(clientes.reservaciones, 'List', { estado: 'CONFIRMADA', mascotaId: toby.id }).catch(() => ({ items: [] }));
    if (conf.items.length) {
      await pasoEsperandoError('ValidarMedica de Toby (vacunas vencidas)', grpc.status.FAILED_PRECONDITION,
        () => llamar(clientes.reservaciones, 'ValidarMedica', { id: conf.items[0].id }));
    }
  }

  await paso('Create como COTIZACION (confirmar=false)', async () => {
    const r = await llamar(clientes.reservaciones, 'Create', { mascotaId: ctx.mascota.id, zona: 'VIP', fechaEntrada: fecha(40), fechaSalida: fecha(42), confirmar: false });
    ctx.cotizacion = r;
    return `${r.folio} | ${r.estado}`;
  });
  await paso('Confirmar', async () => (await llamar(clientes.reservaciones, 'Confirmar', { id: ctx.cotizacion.id })).estado);
  await paso('Cancelar', async () => (await llamar(clientes.reservaciones, 'Cancelar', { id: ctx.cotizacion.id, nota: 'Prueba de cancelación' })).estado);
  await paso('Delete (reservación cancelada sin pagos)', async () => (await llamar(clientes.reservaciones, 'Delete', { id: ctx.cotizacion.id })).mensaje);

  console.log('\n[MascotaService - limpieza]');
  await paso('Delete (mascota de prueba)', async () => (await llamar(clientes.mascotas, 'Delete', { id: ctx.mascota.id })).mensaje);

  console.log(`\nResultado: ${exitos} correctos, ${fallos} fallidos\n`);
  Object.values(clientes).forEach((c) => c.close());
  process.exit(fallos ? 1 : 0);
}

main().catch((err) => {
  console.error('Error inesperado del cliente gRPC:', err.message);
  process.exit(1);
});

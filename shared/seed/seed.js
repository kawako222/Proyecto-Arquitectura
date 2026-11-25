'use strict';

/**
 * Seed de La Casa de la Nana.
 * - Limpia las colecciones del dominio.
 * - Crea usuarios por rol, las 29 habitaciones en 4 zonas, mascotas,
 *   turnos de caja, movimientos y reservaciones en todos los estados.
 *
 * Uso (dentro del contenedor rest-api):  npm run seed
 */

const { connectDB, disconnectDB } = require('../config/db');
const { Usuario, Habitacion, Mascota, Reservacion, TurnoCaja, MovimientoCaja } = require('../models');
const {
  ROLES, PLAN_HABITACIONES, MAX_HABITACIONES, ESTADOS_RESERVACION: E, ESTADOS_HABITACION, SERVICIOS_EXTRA, ESTADOS_TURNO
} = require('../config/constants');
const { hashPassword } = require('../services/authService');
const { inicioDelDia, calcularNoches, redondear, MS_DIA } = require('../utils/helpers');

const HOY = inicioDelDia(new Date());
const dia = (n) => new Date(HOY.getTime() + n * MS_DIA);
const unAnio = (desdeDias = -30) => ({ fechaAplicacion: dia(desdeDias), fechaVencimiento: dia(desdeDias + 365) });

const CREDENCIALES = [
  { nombre: 'Nana Administradora', email: 'admin@lacasadelanana.mx', password: 'Admin12345', rol: ROLES.ADMIN, telefono: '8341000001' },
  { nombre: 'Carlos Staff', email: 'staff@lacasadelanana.mx', password: 'Staff12345', rol: ROLES.STAFF, telefono: '8341000002' },
  { nombre: 'Mariana López', email: 'mariana@correo.mx', password: 'Cliente12345', rol: ROLES.CLIENTE, telefono: '8341000003' },
  { nombre: 'Jorge Hernández', email: 'jorge@correo.mx', password: 'Cliente12345', rol: ROLES.CLIENTE, telefono: '8341000004' }
];

function vacunasCompletas(desdeDias = -30) {
  return ['Rabia', 'Múltiple', 'Bordetella'].map((nombre) => ({ nombre, ...unAnio(desdeDias) }));
}

async function limpiar() {
  await Promise.all([
    Usuario.deleteMany({}),
    Habitacion.deleteMany({}),
    Mascota.deleteMany({}),
    Reservacion.deleteMany({}),
    TurnoCaja.deleteMany({}),
    MovimientoCaja.deleteMany({})
  ]);
  await Promise.all([Usuario, Habitacion, Mascota, Reservacion, TurnoCaja, MovimientoCaja].map((m) => m.syncIndexes()));
}

async function crearUsuarios() {
  const usuarios = {};
  for (const c of CREDENCIALES) {
    const u = await Usuario.create({
      nombre: c.nombre, email: c.email, telefono: c.telefono, rol: c.rol, passwordHash: await hashPassword(c.password)
    });
    usuarios[c.email] = u;
  }
  return usuarios;
}

async function crearHabitaciones() {
  const docs = [];
  PLAN_HABITACIONES.forEach((plan) => {
    for (let i = 1; i <= plan.cantidad; i += 1) {
      docs.push({
        numero: `${plan.prefijo}-${String(i).padStart(2, '0')}`,
        zona: plan.zona,
        capacidad: plan.capacidad,
        precioNoche: plan.precioNoche,
        amenidades: plan.amenidades,
        estado: ESTADOS_HABITACION.DISPONIBLE
      });
    }
  });
  if (docs.length !== MAX_HABITACIONES) {
    throw new Error(`El plan genera ${docs.length} habitaciones y la regla exige ${MAX_HABITACIONES}`);
  }
  const habitaciones = await Habitacion.insertMany(docs);
  return Object.fromEntries(habitaciones.map((h) => [h.numero, h]));
}

async function crearMascotas(u) {
  const mariana = u['mariana@correo.mx']._id;
  const jorge = u['jorge@correo.mx']._id;
  const lista = [
    { nombre: 'Canela', raza: 'Cocker Spaniel', sexo: 'HEMBRA', edad: 11, pesoKg: 12, tamano: 'MEDIANO', tutor: mariana,
      condiciones: { geriatrico: true, descripcion: 'Artritis leve, requiere cama ortopédica' }, vacunas: vacunasCompletas(-60),
      notasMedicas: 'Condroprotector diario con el desayuno', veterinarioContacto: 'Dra. Ruiz 834-555-0101' },
    { nombre: 'Rocky', raza: 'Pastor Alemán', sexo: 'MACHO', edad: 4, pesoKg: 34, tamano: 'GRANDE', tutor: mariana,
      condiciones: { sensiblePirotecnia: true, descripcion: 'Pánico a cohetes y truenos' }, vacunas: vacunasCompletas(-20) },
    { nombre: 'Luna', raza: 'Schnauzer', sexo: 'HEMBRA', edad: 6, pesoKg: 8, tamano: 'CHICO', tutor: jorge,
      condiciones: { necesidadesEspeciales: true, descripcion: 'Diabética: insulina 2 veces al día' }, vacunas: vacunasCompletas(-90),
      alergias: ['Pollo'], notasMedicas: 'Insulina 8:00 y 20:00' },
    { nombre: 'Max', raza: 'Golden Retriever', sexo: 'MACHO', edad: 3, pesoKg: 30, tamano: 'GRANDE', tutor: jorge,
      vacunas: vacunasCompletas(-10) },
    { nombre: 'Toby', raza: 'Beagle', sexo: 'MACHO', edad: 2, pesoKg: 11, tamano: 'MEDIANO', tutor: jorge,
      vacunas: [
        { nombre: 'Rabia', fechaAplicacion: dia(-400), fechaVencimiento: dia(-35) },
        { nombre: 'Múltiple', ...unAnio(-15) }
      ],
      notasMedicas: 'Cartilla incompleta: Rabia vencida y sin Bordetella (sirve para probar la validación médica)' }
  ];
  const mascotas = await Mascota.insertMany(lista);
  return Object.fromEntries(mascotas.map((m) => [m.nombre, m]));
}

function armarReservacion({ mascota, habitacion, entrada, salida, servicios = [], estado, staffId }) {
  const noches = calcularNoches(entrada, salida);
  const srv = servicios.map((clave) => ({ clave, nombre: SERVICIOS_EXTRA[clave].nombre, precio: SERVICIOS_EXTRA[clave].precio }));
  const subtotalHospedaje = redondear(habitacion.precioNoche * noches);
  const subtotalServicios = redondear(srv.reduce((a, s) => a + s.precio, 0));
  const total = redondear(subtotalHospedaje + subtotalServicios);
  return {
    mascota: mascota._id,
    tutor: mascota.tutor,
    habitacion: habitacion._id,
    zona: habitacion.zona,
    fechaEntrada: entrada,
    fechaSalida: salida,
    noches,
    precioNoche: habitacion.precioNoche,
    servicios: srv,
    subtotalHospedaje,
    subtotalServicios,
    total,
    pagado: 0,
    saldo: total,
    estado,
    creadoPor: staffId,
    historial: [{ estado: E.CONFIRMADA, usuario: staffId, nota: 'Reservación agendada (seed)', fecha: dia(-1) }]
  };
}

async function pagar(reservacion, { monto, metodo, fecha, turno, staffId }) {
  const mov = await MovimientoCaja.create({
    turno: turno._id,
    tipo: 'INGRESO',
    categoria: 'RESERVACION',
    concepto: `Pago reservación ${reservacion.folio}`,
    monto,
    metodoPago: metodo,
    reservacion: reservacion._id,
    registradoPor: staffId,
    fecha
  });
  reservacion.pagos.push({ monto, metodo, fecha, registradoPor: staffId, movimientoCaja: mov._id });
  reservacion.pagado = redondear(reservacion.pagado + monto);
  reservacion.saldo = redondear(Math.max(0, reservacion.total - reservacion.pagado));
}

async function cerrarTurnoHistorico(turno, fechaCierre, staffId, efectivoContado) {
  const movs = await MovimientoCaja.find({ turno: turno._id });
  const ingresos = movs.filter((m) => m.tipo === 'INGRESO');
  const gastos = movs.filter((m) => m.tipo === 'GASTO');
  const suma = (arr) => redondear(arr.reduce((a, m) => a + m.monto, 0));
  const efectivo = (arr) => arr.filter((m) => m.metodoPago === 'EFECTIVO');
  const esperado = redondear(turno.montoInicial + suma(efectivo(ingresos)) - suma(efectivo(gastos)));
  Object.assign(turno, {
    estado: ESTADOS_TURNO.CERRADO,
    cerradoPor: staffId,
    fechaCierre,
    totalIngresos: suma(ingresos),
    totalGastos: suma(gastos),
    efectivoEsperado: esperado,
    efectivoContado: efectivoContado ?? esperado,
    diferencia: redondear((efectivoContado ?? esperado) - esperado)
  });
  await turno.save();
}

async function crearOperacion(u, h, m) {
  const staffId = u['staff@lacasadelanana.mx']._id;
  const adminId = u['admin@lacasadelanana.mx']._id;
  const resumen = { finalizadas: 0, enCurso: 0, confirmadas: 0, validadas: 0, canceladas: 0, cotizaciones: 0 };

  // --- Turno historico (cerrado) con estancias finalizadas de meses anteriores ---
  const historico = await TurnoCaja.create({ montoInicial: 1500, abiertoPor: adminId, fechaApertura: dia(-95), notas: 'Turno histórico (seed)' });

  const pasadas = [
    { mascota: m.Canela, hab: h['GER-02'], e: -88, s: -82, srv: ['BANO'], metodo: 'TARJETA' },
    { mascota: m.Rocky, hab: h['PIR-03'], e: -62, s: -58, srv: ['PASEO'], metodo: 'EFECTIVO' },
    { mascota: m.Max, hab: h['VIP-02'], e: -45, s: -40, srv: ['BANO', 'TRANSPORTE'], metodo: 'TRANSFERENCIA' },
    { mascota: m.Luna, hab: h['ESP-01'], e: -30, s: -26, srv: ['MEDICACION', 'DIETA_ESPECIAL'], metodo: 'EFECTIVO' },
    { mascota: m.Max, hab: h['VIP-04'], e: -15, s: -12, srv: [], metodo: 'TARJETA' },
    { mascota: m.Rocky, hab: h['PIR-01'], e: -9, s: -6, srv: ['PASEO', 'BANO'], metodo: 'EFECTIVO' }
  ];
  for (const p of pasadas) {
    const r = new Reservacion(armarReservacion({ mascota: p.mascota, habitacion: p.hab, entrada: dia(p.e), salida: dia(p.s), servicios: p.srv, estado: E.FINALIZADA, staffId }));
    r.validacionMedica = { aprobada: true, fecha: dia(p.e), validadoPor: staffId };
    r.checkIn = { fecha: dia(p.e), usuario: staffId };
    r.checkOut = { fecha: dia(p.s), usuario: staffId };
    await r.save();
    await pagar(r, { monto: redondear(r.total / 2), metodo: p.metodo, fecha: dia(p.e - 3), turno: historico, staffId });
    await pagar(r, { monto: r.saldo, metodo: p.metodo, fecha: dia(p.s), turno: historico, staffId });
    r.historial.push(
      { estado: E.VALIDADA, usuario: staffId, fecha: dia(p.e) },
      { estado: E.EN_CURSO, usuario: staffId, fecha: dia(p.e) },
      { estado: E.FINALIZADA, usuario: staffId, fecha: dia(p.s) }
    );
    await r.save();
    await Reservacion.collection.updateOne({ _id: r._id }, { $set: { createdAt: dia(p.e - 5) } });
    resumen.finalizadas += 1;
  }

  const gastos = [
    { categoria: 'ALIMENTO', concepto: 'Croquetas premium (10 bultos)', monto: 6800, d: -80, metodo: 'TRANSFERENCIA' },
    { categoria: 'LIMPIEZA', concepto: 'Desinfectante veterinario y jergas', monto: 1250, d: -70, metodo: 'EFECTIVO' },
    { categoria: 'VETERINARIO', concepto: 'Visita de revisión semanal', monto: 900, d: -50, metodo: 'EFECTIVO' },
    { categoria: 'SERVICIOS', concepto: 'Recibo de luz bimestral', monto: 3400, d: -35, metodo: 'TRANSFERENCIA' },
    { categoria: 'MANTENIMIENTO', concepto: 'Reparación de aire acondicionado VIP', monto: 2100, d: -20, metodo: 'TARJETA' },
    { categoria: 'ALIMENTO', concepto: 'Premios y suplementos', monto: 780, d: -8, metodo: 'EFECTIVO' }
  ];
  for (const g of gastos) {
    await MovimientoCaja.create({ turno: historico._id, tipo: 'GASTO', categoria: g.categoria, concepto: g.concepto, monto: g.monto, metodoPago: g.metodo, registradoPor: adminId, fecha: dia(g.d) });
  }
  await cerrarTurnoHistorico(historico, dia(-1), staffId);

  // --- Turno actual (abierto) ---
  const turno = await TurnoCaja.create({ montoInicial: 2000, abiertoPor: staffId, fechaApertura: HOY, notas: 'Turno matutino (seed)', efectivoEsperado: 2000 });

  // EN_CURSO: Canela en geriatricos, ya hizo check-in hace 2 dias, anticipo pagado
  const enCurso = new Reservacion(armarReservacion({ mascota: m.Canela, habitacion: h['GER-01'], entrada: dia(-2), salida: dia(3), servicios: ['MEDICACION'], estado: E.EN_CURSO, staffId }));
  enCurso.validacionMedica = { aprobada: true, fecha: dia(-2), validadoPor: staffId };
  enCurso.checkIn = { fecha: dia(-2), usuario: staffId, notas: 'Llegó tranquila, trae su cobija' };
  await enCurso.save();
  await pagar(enCurso, { monto: 1000, metodo: 'EFECTIVO', fecha: new Date(), turno, staffId });
  enCurso.historial.push({ estado: E.VALIDADA, usuario: staffId, fecha: dia(-2) }, { estado: E.EN_CURSO, usuario: staffId, fecha: dia(-2) });
  await enCurso.save();
  await Habitacion.updateOne({ _id: h['GER-01']._id }, { estado: ESTADOS_HABITACION.OCUPADA });
  resumen.enCurso += 1;

  // VALIDADA: Luna en especiales, entra en 2 dias
  const validada = new Reservacion(armarReservacion({ mascota: m.Luna, habitacion: h['ESP-02'], entrada: dia(2), salida: dia(6), servicios: ['MEDICACION'], estado: E.VALIDADA, staffId }));
  validada.validacionMedica = { aprobada: true, fecha: new Date(), validadoPor: staffId, observaciones: 'Cartilla vigente' };
  validada.historial.push({ estado: E.VALIDADA, usuario: staffId });
  await validada.save();
  resumen.validadas += 1;

  // CONFIRMADA: Max en VIP para la proxima semana
  const confirmada = new Reservacion(armarReservacion({ mascota: m.Max, habitacion: h['VIP-01'], entrada: dia(7), salida: dia(10), servicios: ['BANO'], estado: E.CONFIRMADA, staffId }));
  await confirmada.save();
  resumen.confirmadas += 1;

  // CONFIRMADA: Toby (vacunas vencidas) -> sirve para probar rechazo de validacion medica
  const toby = new Reservacion(armarReservacion({ mascota: m.Toby, habitacion: h['VIP-03'], entrada: dia(12), salida: dia(14), estado: E.CONFIRMADA, staffId }));
  await toby.save();
  resumen.confirmadas += 1;

  // COTIZACION guardada
  const cot = new Reservacion(armarReservacion({ mascota: m.Rocky, habitacion: h['PIR-02'], entrada: dia(25), salida: dia(28), estado: E.COTIZACION, staffId }));
  cot.historial = [{ estado: E.COTIZACION, usuario: staffId, nota: 'Cotización (seed)' }];
  await cot.save();
  resumen.cotizaciones += 1;

  // CANCELADA
  const cancelada = new Reservacion(armarReservacion({ mascota: m.Rocky, habitacion: h['PIR-04'], entrada: dia(-20), salida: dia(-17), estado: E.CANCELADA, staffId }));
  cancelada.cancelacion = { fecha: dia(-22), usuario: u['mariana@correo.mx']._id, motivo: 'Cambio de planes del tutor' };
  cancelada.historial.push({ estado: E.CANCELADA, usuario: u['mariana@correo.mx']._id, fecha: dia(-22) });
  await cancelada.save();
  await Reservacion.collection.updateOne({ _id: cancelada._id }, { $set: { createdAt: dia(-25) } });
  resumen.canceladas += 1;

  // Gasto del turno actual
  await MovimientoCaja.create({ turno: turno._id, tipo: 'GASTO', categoria: 'LIMPIEZA', concepto: 'Bolsas y toallas desechables', monto: 350, metodoPago: 'EFECTIVO', registradoPor: staffId });
  const movsTurno = await MovimientoCaja.find({ turno: turno._id });
  const ing = movsTurno.filter((x) => x.tipo === 'INGRESO');
  const gas = movsTurno.filter((x) => x.tipo === 'GASTO');
  const s = (a) => redondear(a.reduce((acc, x) => acc + x.monto, 0));
  turno.totalIngresos = s(ing);
  turno.totalGastos = s(gas);
  turno.efectivoEsperado = redondear(turno.montoInicial + s(ing.filter((x) => x.metodoPago === 'EFECTIVO')) - s(gas.filter((x) => x.metodoPago === 'EFECTIVO')));
  await turno.save();

  return resumen;
}

async function main() {
  await connectDB({ label: 'seed', retries: 5 });
  console.log('Limpiando colecciones...');
  await limpiar();
  console.log('Creando usuarios (bcrypt 12 rondas)...');
  const usuarios = await crearUsuarios();
  console.log('Creando 29 habitaciones en 4 zonas...');
  const habitaciones = await crearHabitaciones();
  console.log('Creando mascotas...');
  const mascotas = await crearMascotas(usuarios);
  console.log('Creando turnos de caja, movimientos y reservaciones...');
  const resumen = await crearOperacion(usuarios, habitaciones, mascotas);

  const porZona = await Habitacion.aggregate([{ $group: { _id: '$zona', total: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  console.log('\n================ SEED COMPLETADO ================');
  console.log(`Habitaciones: ${Object.keys(habitaciones).length}`);
  porZona.forEach((z) => console.log(`  - ${z._id}: ${z.total}`));
  console.log(`Mascotas: ${Object.keys(mascotas).length}`);
  console.log('Reservaciones:', JSON.stringify(resumen));
  console.log(`Movimientos de caja: ${await MovimientoCaja.countDocuments()}`);
  console.log('\nCredenciales de prueba:');
  CREDENCIALES.forEach((c) => console.log(`  ${c.rol.padEnd(8)} ${c.email.padEnd(28)} ${c.password}`));
  console.log('=================================================\n');
}

main()
  .then(() => disconnectDB())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Error en el seed:', err);
    await disconnectDB().catch(() => {});
    process.exit(1);
  });

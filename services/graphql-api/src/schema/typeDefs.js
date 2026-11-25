'use strict';

const typeDefs = /* GraphQL */ `
  "Fecha en formato ISO-8601 (ej. 2026-12-24T00:00:00.000Z)"
  scalar DateTime
  "Objeto JSON arbitrario"
  scalar JSON

  enum Rol { ADMIN STAFF CLIENTE }
  enum EstadoHabitacion { DISPONIBLE OCUPADA LIMPIEZA MANTENIMIENTO }
  enum EstadoReservacion { COTIZACION CONFIRMADA VALIDADA EN_CURSO FINALIZADA CANCELADA }
  enum Sexo { MACHO HEMBRA }
  enum Tamano { CHICO MEDIANO GRANDE GIGANTE }
  enum MetodoPago { EFECTIVO TARJETA TRANSFERENCIA }
  enum TipoMovimiento { INGRESO GASTO }
  enum ServicioExtra { BANO PASEO MEDICACION TRANSPORTE DIETA_ESPECIAL }

  # ------------------------- Tipos -------------------------
  type Usuario {
    id: ID!
    nombre: String!
    email: String!
    rol: Rol!
    telefono: String
    activo: Boolean
    ultimoAcceso: DateTime
    createdAt: DateTime
  }

  type UsuarioRef { id: ID! nombre: String email: String telefono: String }

  type AuthPayload { usuario: Usuario! token: String! }

  type Habitacion {
    id: ID!
    numero: String!
    "Geriátricos | Sensibles a pirotecnia | Especiales | VIP"
    zona: String!
    capacidad: Int!
    precioNoche: Float!
    estado: EstadoHabitacion!
    amenidades: [String!]!
    notas: String
    activa: Boolean!
    createdAt: DateTime
    updatedAt: DateTime
  }

  type ResumenZona { zona: String! total: Int! DISPONIBLE: Int! OCUPADA: Int! LIMPIEZA: Int! MANTENIMIENTO: Int! }

  type Vacuna { nombre: String! fechaAplicacion: DateTime! fechaVencimiento: DateTime! }
  type Condiciones { geriatrico: Boolean sensiblePirotecnia: Boolean necesidadesEspeciales: Boolean descripcion: String }
  type EstadoVacunas { vigentes: Boolean! faltantes: [String!]! vencidas: [String!]! }

  type Mascota {
    id: ID!
    nombre: String!
    especie: String
    raza: String
    sexo: Sexo!
    edad: Float!
    pesoKg: Float!
    tamano: Tamano!
    tutor: UsuarioRef
    condiciones: Condiciones
    vacunas: [Vacuna!]!
    alergias: [String!]!
    notasMedicas: String
    veterinarioContacto: String
    activa: Boolean
    "Calculado al vuelo contra las vacunas obligatorias (Rabia, Múltiple, Bordetella)"
    estadoVacunas: EstadoVacunas!
    createdAt: DateTime
  }

  type MascotaRef { id: ID! nombre: String raza: String edad: Float tamano: Tamano }
  type HabitacionRef { id: ID! numero: String zona: String precioNoche: Float estado: EstadoHabitacion }

  type ServicioCotizado { clave: String! nombre: String! precio: Float! }
  type Pago { id: ID metodo: MetodoPago! monto: Float! fecha: DateTime referencia: String }
  type EventoHistorial { estado: EstadoReservacion! fecha: DateTime nota: String }
  type ValidacionMedica { aprobada: Boolean fecha: DateTime observaciones: String }
  type EventoOperacion { fecha: DateTime notas: String }
  type Cancelacion { fecha: DateTime motivo: String }

  type Reservacion {
    id: ID!
    folio: String!
    mascota: MascotaRef
    tutor: UsuarioRef
    habitacion: HabitacionRef
    zona: String!
    fechaEntrada: DateTime!
    fechaSalida: DateTime!
    noches: Int!
    precioNoche: Float!
    servicios: [ServicioCotizado!]!
    subtotalHospedaje: Float!
    subtotalServicios: Float!
    total: Float!
    pagado: Float!
    saldo: Float!
    pagos: [Pago!]!
    estado: EstadoReservacion!
    validacionMedica: ValidacionMedica
    checkIn: EventoOperacion
    checkOut: EventoOperacion
    cancelacion: Cancelacion
    notas: String
    historial: [EventoHistorial!]!
    createdAt: DateTime
  }

  type Cotizacion {
    mascota: MascotaRef!
    habitacion: HabitacionRef!
    fechaEntrada: DateTime!
    fechaSalida: DateTime!
    noches: Int!
    precioNoche: Float!
    servicios: [ServicioCotizado!]!
    subtotalHospedaje: Float!
    subtotalServicios: Float!
    total: Float!
  }

  type TurnoCaja {
    id: ID!
    estado: String!
    montoInicial: Float!
    fechaApertura: DateTime
    fechaCierre: DateTime
    totalIngresos: Float
    totalGastos: Float
    efectivoEsperado: Float
    efectivoContado: Float
    diferencia: Float
    notas: String
  }

  type MovimientoCaja {
    id: ID!
    turno: ID!
    tipo: TipoMovimiento!
    categoria: String!
    concepto: String!
    monto: Float!
    metodoPago: MetodoPago!
    fecha: DateTime
  }

  type TotalesCaja { totalIngresos: Float! totalGastos: Float! efectivoEsperado: Float! movimientos: Int! }
  type EstadoCaja { abierto: Boolean! turno: TurnoCaja totales: TotalesCaja }

  type KpiTicket { desde: DateTime! hasta: DateTime! ticketPromedio: Float! ingresosEstancias: Float! estanciasFinalizadas: Int! }
  type KpiMes { mes: String! ingresos: Float! gastos: Float! utilidad: Float! }
  type KpiIngresos { anio: Int! meses: [KpiMes!]! totalIngresos: Float! totalGastos: Float! }
  type KpiZona { zona: String! habitaciones: Int! nochesDisponibles: Int! nochesOcupadas: Int! tasaOcupacion: Float! }
  type KpiOcupacion { desde: DateTime! hasta: DateTime! nochesRango: Int! zonas: [KpiZona!]! tasaOcupacionGlobal: Float! }
  type KpiCancelaciones { desde: DateTime! hasta: DateTime! totalReservaciones: Int! canceladas: Int! tasaCancelacion: Float! porEstado: JSON! }
  type KpiResumen { ticketPromedio: KpiTicket! ocupacionPorZona: KpiOcupacion! cancelaciones: KpiCancelaciones! ingresosMensuales: KpiIngresos! }

  # ------------------------- Inputs -------------------------
  input HabitacionInput {
    numero: String
    zona: String
    capacidad: Int
    precioNoche: Float
    estado: EstadoHabitacion
    amenidades: [String!]
    notas: String
    activa: Boolean
  }

  input VacunaInput { nombre: String! fechaAplicacion: DateTime! fechaVencimiento: DateTime! }
  input CondicionesInput { geriatrico: Boolean sensiblePirotecnia: Boolean necesidadesEspeciales: Boolean descripcion: String }

  input MascotaInput {
    nombre: String
    especie: String
    raza: String
    sexo: Sexo
    edad: Float
    pesoKg: Float
    tamano: Tamano
    "Obligatorio cuando crea STAFF/ADMIN; se ignora para CLIENTE"
    tutor: ID
    condiciones: CondicionesInput
    vacunas: [VacunaInput!]
    alergias: [String!]
    notasMedicas: String
    veterinarioContacto: String
    activa: Boolean
  }

  input CotizacionInput {
    mascota: ID!
    habitacion: ID
    zona: String
    fechaEntrada: DateTime!
    fechaSalida: DateTime!
    servicios: [ServicioExtra!]
    notas: String
  }

  input ReservacionInput {
    mascota: ID!
    habitacion: ID
    zona: String
    fechaEntrada: DateTime!
    fechaSalida: DateTime!
    servicios: [ServicioExtra!]
    notas: String
    "false = guardar solo como COTIZACION"
    confirmar: Boolean
  }

  input ReservacionUpdateInput {
    habitacion: ID
    fechaEntrada: DateTime
    fechaSalida: DateTime
    servicios: [ServicioExtra!]
    notas: String
  }

  input PagoInput { monto: Float! metodo: MetodoPago! referencia: String }
  input MovimientoInput { tipo: TipoMovimiento! categoria: String! concepto: String! monto: Float! metodoPago: MetodoPago }
  input RangoInput { desde: DateTime hasta: DateTime anio: Int }

  # ------------------------- Operaciones -------------------------
  type Query {
    me: Usuario!
    usuarios(rol: Rol): [Usuario!]!

    habitaciones(zona: String, estado: EstadoHabitacion, disponibleDesde: DateTime, disponibleHasta: DateTime): [Habitacion!]!
    habitacion(id: ID!): Habitacion!
    resumenZonas: [ResumenZona!]!

    mascotas(nombre: String, tutor: ID): [Mascota!]!
    mascota(id: ID!): Mascota!

    reservaciones(estado: String, zona: String, mascota: ID, desde: DateTime, hasta: DateTime, page: Int, limit: Int): [Reservacion!]!
    reservacion(id: ID!): Reservacion!
    cotizarReservacion(input: CotizacionInput!): Cotizacion!

    estadoCaja: EstadoCaja!
    turnosCaja(estado: String): [TurnoCaja!]!
    movimientosCaja(tipo: TipoMovimiento, desde: DateTime, hasta: DateTime): [MovimientoCaja!]!

    kpis(rango: RangoInput): KpiResumen!
  }

  type Mutation {
    registro(nombre: String!, email: String!, password: String!, telefono: String): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!

    crearHabitacion(input: HabitacionInput!): Habitacion!
    actualizarHabitacion(id: ID!, input: HabitacionInput!): Habitacion!
    eliminarHabitacion(id: ID!): Habitacion!

    crearMascota(input: MascotaInput!): Mascota!
    actualizarMascota(id: ID!, input: MascotaInput!): Mascota!
    eliminarMascota(id: ID!): Mascota!

    crearReservacion(input: ReservacionInput!): Reservacion!
    actualizarReservacion(id: ID!, input: ReservacionUpdateInput!): Reservacion!
    eliminarReservacion(id: ID!): Reservacion!
    confirmarReservacion(id: ID!): Reservacion!
    validarMedica(id: ID!, observaciones: String): Reservacion!
    checkIn(id: ID!, notas: String): Reservacion!
    registrarPago(id: ID!, input: PagoInput!): Reservacion!
    checkOut(id: ID!, notas: String): Reservacion!
    cancelarReservacion(id: ID!, motivo: String): Reservacion!

    abrirTurnoCaja(montoInicial: Float!, notas: String): TurnoCaja!
    cerrarTurnoCaja(efectivoContado: Float!, notas: String): TurnoCaja!
    registrarMovimientoCaja(input: MovimientoInput!): MovimientoCaja!
  }
`;

module.exports = { typeDefs };

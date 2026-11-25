'use strict';

/**
 * Capa de dominio compartida. REST, GraphQL y gRPC son adaptadores delgados
 * que delegan aqui, por lo que las reglas de negocio y el RBAC son identicos
 * en los tres protocolos.
 */
module.exports = {
  authService: require('./authService'),
  habitacionService: require('./habitacionService'),
  mascotaService: require('./mascotaService'),
  reservacionService: require('./reservacionService'),
  cajaService: require('./cajaService'),
  kpiService: require('./kpiService')
};

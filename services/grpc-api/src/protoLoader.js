'use strict';

const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'nana.proto');

/**
 * keepCase:false convierte snake_case del .proto a camelCase en JS
 * (precio_noche -> precioNoche), igual que los modelos Mongoose.
 * oneofs:true permite distinguir campos "optional" no enviados.
 */
const OPCIONES = { keepCase: false, longs: String, enums: String, defaults: true, oneofs: true };

function cargarProto() {
  const definicion = protoLoader.loadSync(PROTO_PATH, OPCIONES);
  return grpc.loadPackageDefinition(definicion).nana.v1;
}

module.exports = { cargarProto, PROTO_PATH, grpc };

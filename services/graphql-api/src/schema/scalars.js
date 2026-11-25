'use strict';

const { GraphQLScalarType, Kind, GraphQLError } = require('graphql');

function aISO(valor) {
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) throw new GraphQLError(`DateTime inválido: ${valor}`);
  return fecha.toISOString();
}

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  description: 'Fecha ISO-8601',
  serialize: (valor) => aISO(valor),
  parseValue: (valor) => aISO(valor),
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) throw new GraphQLError('DateTime debe ser un string ISO-8601');
    return aISO(ast.value);
  }
});

function literalAValor(ast) {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return Number(ast.value);
    case Kind.OBJECT:
      return Object.fromEntries(ast.fields.map((f) => [f.name.value, literalAValor(f.value)]));
    case Kind.LIST:
      return ast.values.map(literalAValor);
    default:
      return null;
  }
}

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Objeto JSON arbitrario',
  serialize: (valor) => valor,
  parseValue: (valor) => valor,
  parseLiteral: literalAValor
});

module.exports = { DateTime, JSONScalar };

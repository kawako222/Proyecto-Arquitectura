'use strict';

/**
 * Plugin comun: expone "id" en lugar de "_id", oculta "__v" y campos sensibles.
 */
function toJSONPlugin(schema) {
  const transform = (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  };
  schema.set('toJSON', { virtuals: true, versionKey: false, transform });
  schema.set('toObject', { virtuals: true, versionKey: false, transform });
}

module.exports = { toJSONPlugin };

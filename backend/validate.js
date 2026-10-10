'use strict';

// Tiny schema validator. Unknown fields are rejected.
// Field spec: { type: 'string'|'int'|'bool'|'enum'|'date'|'object'|'array', required, nullable, max, min, values, raw }
// Strings are trimmed unless raw is set.

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkField(name, spec, value) {
  if (value === null) return spec.nullable ? null : `${name} must not be null`;
  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string') return `${name} must be a string`;
      if (spec.min && value.trim().length < spec.min) return `${name} must not be empty`;
      if (spec.max && value.length > spec.max) return `${name} must be at most ${spec.max} characters`;
      return null;
    case 'int':
      if (!Number.isInteger(value)) return `${name} must be an integer`;
      if (spec.min !== undefined && value < spec.min) return `${name} must be at least ${spec.min}`;
      return null;
    case 'bool':
      return typeof value === 'boolean' ? null : `${name} must be true or false`;
    case 'enum':
      return spec.values.includes(value) ? null : `${name} must be one of: ${spec.values.join(', ')}`;
    case 'date':
      if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
        return `${name} must be a date (YYYY-MM-DD)`;
      }
      return null;
    case 'object':
      return value && typeof value === 'object' && !Array.isArray(value) ? null : `${name} must be an object`;
    case 'array':
      return Array.isArray(value) ? null : `${name} must be an array`;
    default:
      return `${name} has an unknown type`;
  }
}

// Validates `body` against `schema`. With partial = true, required is ignored.
function validate(body, schema, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'validation_error', 'Request body must be a JSON object');
  }
  const errors = [];
  for (const key of Object.keys(body)) {
    if (!schema[key]) errors.push(`${key} is not a known field`);
  }
  const out = {};
  for (const [name, spec] of Object.entries(schema)) {
    if (!(name in body) || body[name] === undefined) {
      if (spec.required && !partial) errors.push(`${name} is required`);
      continue;
    }
    const err = checkField(name, spec, body[name]);
    if (err) errors.push(err);
    else out[name] = typeof body[name] === 'string' && spec.type === 'string' && !spec.raw ? body[name].trim() : body[name];
  }
  if (errors.length) throw new HttpError(400, 'validation_error', errors[0], errors);
  return out;
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'invalid_id', 'Id must be a positive integer');
  return id;
}

module.exports = { HttpError, validate, parseId };

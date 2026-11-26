-- Asistente V2.10: registro canónico, época y auditoría técnica.
-- La época vive en registro_estado para que activar o revertir siempre avance.

CREATE TABLE IF NOT EXISTS registro_versiones (
  version INTEGER PRIMARY KEY,
  hash TEXT NOT NULL,
  contenido TEXT NOT NULL,
  publicado_en TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 0 CHECK (activo IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS registro_versiones_una_activa
  ON registro_versiones (activo)
  WHERE activo = 1;

CREATE TABLE IF NOT EXISTS registro_estado (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  epoch INTEGER NOT NULL DEFAULT 0,
  ruta_precio_activa INTEGER NOT NULL DEFAULT 1 CHECK (ruta_precio_activa IN (0, 1)),
  motivo TEXT,
  actualizado_en TEXT NOT NULL
);

INSERT OR IGNORE INTO registro_estado (id, epoch, ruta_precio_activa, motivo, actualizado_en)
VALUES (1, 0, 1, NULL, '2026-11-26T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS auditoria_asistente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creado_en TEXT NOT NULL,
  version_linealizacion INTEGER,
  epoch_antes INTEGER,
  epoch_despues INTEGER,
  publicacion_durante_ventana TEXT,
  ruta TEXT,
  etiqueta INTEGER,
  confianza REAL,
  puerta_ok INTEGER,
  juez_ok INTEGER,
  motivo TEXT,
  hash_mensaje TEXT
);

CREATE INDEX IF NOT EXISTS auditoria_asistente_creado_en
  ON auditoria_asistente (creado_en);

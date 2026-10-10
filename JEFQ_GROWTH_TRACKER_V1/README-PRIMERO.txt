JEFQ GROWTH TRACKER V1

OBJETIVO
Registrar contactos, propuestas, objeciones, seguimientos y resultados comerciales sin depender de un CRM externo.

ARCHIVOS
- datos/leads.csv: un registro por contacto.
- datos/eventos.csv: acciones importantes del recorrido.
- datos/seguimientos.csv: llamadas, WhatsApp, reuniones y próximos pasos.
- datos/objeciones.csv: objeciones reales y respuesta aplicada.
- datos/propuestas.csv: cotizaciones y estado comercial.
- dashboard/JEFQ-GROWTH-DASHBOARD.html: panel ejecutivo local.

REGLAS
1. No registrar contraseñas, MFA, llaves privadas ni detalles explotables.
2. Usar un LeadId único, por ejemplo L-20261002-001.
3. Actualizar Estado y ProximoPaso después de cada conversación.
4. Registrar motivos reales de pérdida.
5. Hacer una copia del directorio antes de cambios masivos.

ESTADOS
Nuevo > Contactado > Reunion > Propuesta > Seguimiento > Ganado o Perdido.
-- Update features column from string array to object array with title+description
UPDATE subscription_plans
SET features = '[
  {"title": "Punto de venta", "description": "Facturación rápida desde cualquier dispositivo"},
  {"title": "Gestión de productos", "description": "Administra precios, categorías y variantes"},
  {"title": "Control de inventario", "description": "Gestiona stock y movimientos en tiempo real"},
  {"title": "Reportes Dinámicos", "description": "Analiza tu negocio con datos precisos"},
  {"title": "Gestión de Usuarios", "description": "Administra empleados y permisos del sistema"},
  {"title": "Soporte email", "description": "Asistencia técnica vía correo electrónico"},
  {"title": "Soporte WhatsApp", "description": "Atención directa por mensajería instantánea"}
]'::jsonb
WHERE name = 'Plan Emprendedor';

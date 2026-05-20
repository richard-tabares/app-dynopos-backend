-- Update plan description and features to match actual DynoPOS features
UPDATE subscription_plans
SET description = 'Perfecto para empezar tu negocio con punto de venta, control de inventario, reportes y gestión de productos',
    features = '["Punto de venta", "Control de inventario", "Reportes básicos", "Gestión de productos", "1 usuario", "Soporte email"]'
WHERE name = 'Plan Emprendedor';

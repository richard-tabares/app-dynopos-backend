-- ============================================
-- ÍNDICES PARA RENDIMIENTO DE BÚSQUEDA DE PRODUCTOS
-- Creada: 2026-04-28
-- ============================================
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

-- 1. Extensión pg_trgm para índices de búsqueda por similitud
create extension if not exists pg_trgm;

-- 2. Índice trigram para búsqueda ILIKE '%texto%' en product_name
--    Reduce de escaneo secuencial a búsqueda por índice
create index if not exists idx_products_name_trgm
    on products using gin (name gin_trgm_ops);

-- 3. Índice B-tree para búsqueda exacta por SKU
create index if not exists idx_products_sku
    on products(sku);

-- 4. Índice compuesto para filtros por business_id + nombre
create index if not exists idx_products_business_name
    on products(business_id, name);

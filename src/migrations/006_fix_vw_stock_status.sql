-- ============================================
-- CORRECCIÓN: vw_stock_status
-- Creada: 2026-05-02
-- Descripción: Corrige la lógica del CASE para
--   producir 4 estados correctos:
--   - sin_stock   → stock <= 0
--   - stock_bajo  → 0 < stock < min_stock
--   - con_stock   → stock > 0 sin mínimo, o stock >= min_stock
--   - sin_control → track_stock = false
-- ============================================
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

create or replace view public.vw_stock_status with (security_invoker = on) as
select
    p.id as product_id,
    p.name as product_name,
    p.business_id,
    coalesce(i.stock, 0) as current_stock,
    coalesce(i.min_stock, 0) as min_stock,
    case
        when p.track_stock = false then 'sin_control'::text
        when coalesce(i.stock, 0) <= 0 then 'sin_stock'::text
        when coalesce(i.min_stock, 0) = 0 then 'con_stock'::text
        when coalesce(i.stock, 0) < coalesce(i.min_stock, 0) then 'stock_bajo'::text
        else 'con_stock'::text
    end as stock_status
from products p
left join inventory i on i.product_id = p.id
where p.is_active = true;

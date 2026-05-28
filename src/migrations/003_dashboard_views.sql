-- ============================================
-- VISTAS PARA EL DASHBOARD
-- Creada: 2026-04-28
-- ============================================
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

-- vw_top_products: Productos más vendidos con exclusión de devoluciones
-- Incluye variaciones: si el producto tiene variación, muestra "Producto - Variación"
create or replace view public.vw_top_products with (security_invoker = on) as
select
  p.business_id,
  p.id as product_id,
  si.variation_id,
  case
    when si.variation_id is not null then p.name || ' - ' || si.variation_name
    else p.name
  end as product_name,
  sum(si.quantity)::int as total_quantity_sold,
  sum(si.subtotal)::bigint as total_revenue
from "salesItems" si
join "salesTickets" st on st.id = si.sale_id
  and st.status::text <> 'returned'::text
join products p on p.id = si.product_id
group by p.business_id, p.id, si.variation_id, si.variation_name, p.name;

-- Índices recomendados
create index if not exists idx_salestickets_status on "salesTickets"(status);

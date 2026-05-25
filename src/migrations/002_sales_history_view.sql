-- ============================================
-- VISTA: vw_sales_history
-- Creada: 2026-04-28
-- Actualizada: 2026-05-24 (agregado created_by, created_by_name)
-- Descripción: Vista para el historial de ventas
-- con items agregados y cálculo de itemsCount.
-- ============================================
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

-- Agregar columna created_by si no existe
ALTER TABLE salesTickets
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

DROP VIEW IF EXISTS vw_sales_history;

create or replace view vw_sales_history with (security_invoker = true) as
select
    st.id,
    st.total_amount,
    st.created_at,
    st.payment_method,
    st.status,
    st.business_id,
    st.ticket_number,
    st.created_by,
    prof.display_name as created_by_name,
    jsonb_agg(
        jsonb_build_object(
            'id', si.id,
            'product_id', si.product_id,
            'quantity', si.quantity,
            'price', si.unit_price,
            'subtotal', si.subtotal,
            'name', coalesce(p.name, 'Producto eliminado')
        )
        order by si.id
    ) as items,
    sum(si.quantity)::int as items_count
from salesTickets st
join salesItems si on si.sale_id = st.id
left join products p on p.id = si.product_id
left join profiles prof on prof.id = st.created_by
group by st.id, prof.display_name;

-- ============================================
-- ÍNDICES RECOMENDADOS
-- ============================================
create index if not exists idx_salestickets_business_id
    on salesTickets(business_id);

create index if not exists idx_salesitems_sale_id
    on salesItems(sale_id);

create index if not exists idx_salesitems_product_id
    on salesItems(product_id);

-- ============================================
-- VISTA: vw_sales_history
-- Creada: 2026-04-28
-- Descripción: Vista para el historial de ventas
-- con items agregados y cálculo de itemsCount.
-- Reemplaza la query anidada en salesControllers.js
-- ============================================
-- Ejecutar en el SQL Editor de Supabase
-- ============================================

create or replace view vw_sales_history with (security_invoker = true) as
select
    st.id,
    st.total_amount,
    st.created_at,
    st.payment_method,
    st.status,
    st.business_id,
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
group by st.id;

-- ============================================
-- ÍNDICES RECOMENDADOS
-- ============================================
create index if not exists idx_salestickets_business_id
    on salesTickets(business_id);

create index if not exists idx_salesitems_sale_id
    on salesItems(sale_id);

create index if not exists idx_salesitems_product_id
    on salesItems(product_id);

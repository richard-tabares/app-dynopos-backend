import { serviceRoleSupabase } from '../config/supabase.js'

export const getCurrentPlan = async (req, res) => {
  try {
    const { data, error } = await serviceRoleSupabase
      .from('subscription_plans')
      .select('features')
      .eq('status', 'active')
      .limit(1)
      .single()

    if (error) throw new Error(error.message)

    return res.json({ features: data?.features || [] })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}

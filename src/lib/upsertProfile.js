export const upsertProfile = async (user, supabaseClient) => {
  if (!user) throw new Error('User object is required');

  const { id, email, user_metadata } = user;
  const full_name = user_metadata?.full_name;
  const avatar_url = user_metadata?.avatar_url;
  const domain = email.split('@')[1];

  const { data, error } = await supabaseClient
    .from('profiles')
    .upsert({ 
      id, 
      email, 
      full_name, 
      avatar_url, 
      domain,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};
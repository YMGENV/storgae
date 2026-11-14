// Fill in your keys. Only use the Supabase ANON keys here, never service-role keys.
export const CFG = {
  supabase1: { url: 'https://lziiiinmhbcneehnpgqa.supabase.co', anonKey: 'sb_publishable_VKRnTkd7Xeh012r_hJNn0w_1khVgQtc', bucket: 'drive' },
  supabase2: { url: 'https://tikxcwboynwkqxtklxip.supabase.co', anonKey: 'sb_publishable_pigZHa6DSvUo5n4-OXUjdA_tUL_9zg7 
', bucket: 'drive' },
  // Backblaze B2: endpoint like https://s3.us-west-004.backblazeb2.com
  b2:    { endpoint: ' s3.us-east-005.backblazeb2.com', region: 'us-west-005', keyId: '00547b736d473d00000000001', secret: 'K005++kp21u/lz33GVv8h7/cqycZ4mI', bucket: 'Yofitt' },
  // Second Backblaze account (its own 10 GB free)
  b2b:   { endpoint: ' s3.us-east-005.backblazeb2.com', region: 'us-west-005', keyId: '00564e3725de65f0000000001', secret: 'K005n9s0a4wfD8VFVu0UVfWVJSw5JJg', bucket: 'Yogitt2' },
};

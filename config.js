// Fill in your keys. Only use the Supabase ANON keys here, never service-role keys.
export const CFG = {
  supabase1: { url: '', anonKey: '', bucket: 'drive' },
  supabase2: { url: '', anonKey: '', bucket: 'drive' },
  // Backblaze B2: endpoint like https://s3.us-west-004.backblazeb2.com
  b2:    { endpoint: '', region: 'us-west-004', keyId: '', secret: '', bucket: '' },
  // Second Backblaze account (its own 10 GB free)
  b2b:   { endpoint: '', region: 'us-west-004', keyId: '', secret: '', bucket: '' },
};

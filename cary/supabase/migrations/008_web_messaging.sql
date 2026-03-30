-- Add read tracking and device_hash index for in-app messaging
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_sms_messages_device ON sms_messages(device_hash, created_at);

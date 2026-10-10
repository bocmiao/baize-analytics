-- 014 isolated the column UUID but encoded its payload value as an unformatted MD5 string.
-- Normalize only the payload representation; never hash or change the already day-isolated page again.
UPDATE events e SET payload=jsonb_set(e.payload,'{page_id}',to_jsonb(e.page_id::text),true)
 FROM sites s WHERE s.id=e.site_id AND s.privacy_mode='daily_salt' AND e.payload->>'page_id' IS DISTINCT FROM e.page_id::text;

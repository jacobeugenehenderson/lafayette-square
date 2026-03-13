/**
 * Cary — Dispatch Edge Function
 *
 * Called when a new request is created. Finds nearby available Couriers
 * and sends push notifications. First to accept wins.
 */

import { createClient } from '@supabase/supabase-js';
import { findNearbyCouriers, buildNotification } from '../../lib/dispatch.js';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

Deno.serve(async (req) => {
  const { request_id } = await req.json();

  // Fetch the request
  const { data: request } = await supabase
    .from('requests')
    .select('*')
    .eq('id', request_id)
    .single();

  if (!request || request.status !== 'open') {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  // Fetch all active courier locations
  const { data: locations } = await supabase
    .from('courier_locations')
    .select('courier_id, lat, lon');

  // Cross-reference with active courier profiles
  const { data: activeCouriers } = await supabase
    .from('courier_profiles')
    .select('id, vehicle_type')
    .eq('status', 'active');

  const activeIds = new Set(activeCouriers.map((c) => c.id));
  const couriers = locations
    .filter((l) => activeIds.has(l.courier_id))
    .map((l) => ({
      id: l.courier_id,
      lat: l.lat,
      lon: l.lon,
      status: 'available',
      vehicle_type: activeCouriers.find((c) => c.id === l.courier_id)?.vehicle_type,
    }));

  // Find nearby couriers
  const nearby = findNearbyCouriers(
    { lat: request.place_lat, lon: request.place_lon },
    couriers
  );

  // Build notification
  const notification = buildNotification(
    request,
    { name: request.place_name, lat: request.place_lat, lon: request.place_lon },
    { display_name: 'Requester' } // TODO: join requester profile
  );

  // TODO: Send push notifications via FCM / APNs / web push
  // For now, nearby couriers will see the request via real-time subscription
  // on the requests table (status = 'open')

  return new Response(JSON.stringify({
    dispatched_to: nearby.length,
    courier_ids: nearby.map((c) => c.id),
    notification,
  }));
});

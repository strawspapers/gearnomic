// ============================================================
// Gearnomic — Stripe Webhook Handler
// Supabase Edge Function (Deno runtime)
//
// Handles subscription lifecycle events from Stripe and updates
// the user_data.is_supporter column accordingly.
//
// Events handled:
//   customer.subscription.created  → is_supporter = true
//   customer.subscription.updated  → true if active/trialing, else false
//   customer.subscription.deleted  → is_supporter = false
//   checkout.session.completed     → links Stripe customer ID to Supabase user
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

// These are set as secrets in the Supabase dashboard (never hardcoded)
const STRIPE_SECRET_KEY        = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET    = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

// Use the service role key so we can bypass RLS and write to any user's row
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body      = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  // Verify the event came from Stripe and wasn't tampered with
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  console.log(`Received Stripe event: ${event.type}`);

  try {
    switch (event.type) {

      // ── New checkout completed ────────────────────────────────
      // Links the Stripe customer ID to the Supabase user.
      // This must happen before subscription events so we know which
      // user to update.
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const userId     = session.client_reference_id; // we pass this from the checkout URL

        if (!userId || !customerId) {
          console.warn('checkout.session.completed missing userId or customerId', { userId, customerId });
          break;
        }

        const { error } = await supabase
          .from('user_data')
          .update({ stripe_customer_id: customerId })
          .eq('user_id', userId);

        if (error) throw error;
        console.log(`Linked Stripe customer ${customerId} to user ${userId}`);
        break;
      }

      // ── Subscription created or renewed ──────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const active     = ['active', 'trialing'].includes(sub.status);

        const { error } = await supabase
          .from('user_data')
          .update({
            is_supporter:    active,
            supporter_since: active ? new Date().toISOString() : null,
          })
          .eq('stripe_customer_id', customerId);

        if (error) throw error;
        console.log(`Updated supporter status for customer ${customerId}: ${active}`);
        break;
      }

      // ── Subscription cancelled / expired ─────────────────────
      case 'customer.subscription.deleted': {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;

        const { error } = await supabase
          .from('user_data')
          .update({ is_supporter: false })
          .eq('stripe_customer_id', customerId);

        if (error) throw error;
        console.log(`Revoked supporter status for customer ${customerId}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error processing webhook event:', err);
    // Return 500 so Stripe retries the event
    return new Response(`Handler error: ${err.message}`, { status: 500 });
  }
});

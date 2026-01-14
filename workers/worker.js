// Cloudflare Worker for R2 Cloud Storage
// Handles save/load operations with passkey-based data identification
// Secured with API key authentication

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // API Key authentication
        const apiKey = request.headers.get('X-API-Key');
        const validApiKey = env.API_KEY; // Set this in Cloudflare Dashboard or wrangler.toml

        if (!apiKey || apiKey !== validApiKey) {
            return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing API key' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        try {
            // POST /api/save - Save data to R2
            if (url.pathname === '/api/save' && request.method === 'POST') {
                const { passkey, data } = await request.json();

                if (!passkey || !data) {
                    return new Response(JSON.stringify({ error: 'Passkey and data are required' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                // Hash passkey for filename (simple hash for identification)
                const hashedKey = await hashPasskey(passkey);
                const filename = `backup_${hashedKey}.json`;

                // Save to R2
                await env.R2_BUCKET.put(filename, JSON.stringify(data), {
                    httpMetadata: { contentType: 'application/json' }
                });

                return new Response(JSON.stringify({
                    success: true,
                    message: 'Data saved successfully',
                    timestamp: new Date().toISOString()
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // GET /api/check - Check update status (Head request)
            if (url.pathname === '/api/check' && request.method === 'GET') {
                const passkey = url.searchParams.get('passkey');

                if (!passkey) {
                    return new Response(JSON.stringify({ error: 'Passkey is required' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const hashedKey = await hashPasskey(passkey);
                const filename = `backup_${hashedKey}.json`;

                // Use head() to get metadata without body
                const object = await env.R2_BUCKET.head(filename);

                if (!object) {
                    return new Response(JSON.stringify({ found: false }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                return new Response(JSON.stringify({
                    found: true,
                    timestamp: object.uploaded.toISOString(),
                    size: object.size
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // GET /api/load - Load data from R2
            if (url.pathname === '/api/load' && request.method === 'GET') {
                const passkey = url.searchParams.get('passkey');

                if (!passkey) {
                    return new Response(JSON.stringify({ error: 'Passkey is required' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const hashedKey = await hashPasskey(passkey);
                const filename = `backup_${hashedKey}.json`;

                const object = await env.R2_BUCKET.get(filename);

                if (!object) {
                    return new Response(JSON.stringify({ error: 'No data found for this passkey' }), {
                        status: 404,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const data = await object.json();
                return new Response(JSON.stringify({
                    success: true,
                    data,
                    timestamp: object.uploaded?.toISOString() || null
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // DELETE /api/delete - Delete data from R2
            if (url.pathname === '/api/delete' && request.method === 'DELETE') {
                const passkey = url.searchParams.get('passkey');

                if (!passkey) {
                    return new Response(JSON.stringify({ error: 'Passkey is required' }), {
                        status: 400,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                const hashedKey = await hashPasskey(passkey);
                const filename = `backup_${hashedKey}.json`;

                await env.R2_BUCKET.delete(filename);

                return new Response(JSON.stringify({
                    success: true,
                    message: 'Data deleted successfully'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // 404 for unknown routes
            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });

        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    }
};

// Simple hash function for passkey
async function hashPasskey(passkey) {
    const encoder = new TextEncoder();
    const data = encoder.encode(passkey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 32); // Use first 32 chars
}

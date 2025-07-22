// api/webhook.js - Vercel serverless function
export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('Received webhook:', JSON.stringify(payload, null, 2));

    // Extract data from Respond.io payload
    const contactId = payload.contact?.id;
    const firstName = payload.contact?.firstName || '';
    const lastName = payload.contact?.lastName || '';
    const messageText = payload.message?.message?.text || '';
    const timestamp = payload.message?.timestamp;
    const traffic = payload.message?.traffic; // 'incoming' or 'outgoing'

    // Convert timestamp from Unix to ISO format
    const isoTimestamp = new Date(timestamp).toISOString();

    // Create title based on message direction
    const title = traffic === 'incoming' 
      ? `WhatsApp from ${firstName} ${lastName}`.trim()
      : `WhatsApp to ${firstName} ${lastName}`.trim();

    // Create GraphQL mutation
    const graphqlQuery = {
      query: `mutation {
        create_timeline_item(
          item_id: ${contactId},
          title: "${title}",
          timestamp: "${isoTimestamp}",
          custom_activity_id: "6cf1cd71-b853-4e67-a43b-9ff9a0517bf0",
          content: "${messageText.replace(/"/g, '\\"')}"
        ) {
          id
        }
      }`
    };

    // Send to Monday.com API
    const mondayResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQxMjcyMjUzNSwiYWFpIjoxMSwidWlkIjo2NDg2MzE3NCwiaWFkIjoiMjAyNC0wOS0xOVQwMDozNToxNS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQ5NTk4ODEsInJnbiI6InVzZTEifQ.OfbCtB8GlkDmSZWRay92lXx4LdejaevSMVMSplYYLeU',
        'Content-Type': 'application/json',
        'API-Version': '2024-10'
      },
      body: JSON.stringify(graphqlQuery)
    });

    const mondayResult = await mondayResponse.json();
    console.log('Monday.com response:', mondayResult);

    // Check if Monday API call was successful
    if (mondayResult.errors) {
      console.error('Monday.com API errors:', mondayResult.errors);
      return res.status(500).json({ 
        error: 'Failed to create timeline item',
        details: mondayResult.errors 
      });
    }

    // Return success to Respond.io
    return res.status(200).json({ 
      success: true,
      timeline_item_id: mondayResult.data?.create_timeline_item?.id,
      message: 'Timeline item created successfully'
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

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
    const firstName = payload.contact?.firstName || '';
    const lastName = payload.contact?.lastName || '';
    const messageText = payload.message?.message?.text || '';
    const timestamp = payload.message?.timestamp;
    const traffic = payload.message?.traffic; // 'incoming' or 'outgoing'
    const rawPhone = payload.contact?.phone || '';
    
    // Clean phone number for Monday.com (remove + sign)
    const cleanPhone = rawPhone.replace(/^\+/, '');
    console.log('Cleaned phone number:', cleanPhone);
    
    // Convert timestamp from Unix to ISO format
    const isoTimestamp = new Date(timestamp).toISOString();
    
    // Create title based on message direction
    const title = traffic === 'incoming' 
      ? `WhatsApp from ${firstName} ${lastName}`.trim()
      : `WhatsApp to ${firstName} ${lastName}`.trim();

    let mondayItemId = null;

    // First, search Contacts board
    const contactsSearchQuery = {
      query: `query {
        items_by_column_values(
          board_id: 9643846519,
          column_id: "contact_phone",
          column_value: "${cleanPhone}"
        ) {
          id
          name
        }
      }`
    };

    const contactsSearchResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQxMjcyMjUzNSwiYWFpIjoxMSwidWlkIjo2NDg2MzE3NCwiaWFkIjoiMjAyNC0wOS0xOVQwMDozNToxNS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQ5NTk4ODEsInJnbiI6InVzZTEifQ.OfbCtB8GlkDmSZWRay92lXx4LdejaevSMVMSplYYLeU',
        'Content-Type': 'application/json',
        'API-Version': '2024-10'
      },
      body: JSON.stringify(contactsSearchQuery)
    });

    const contactsResult = await contactsSearchResponse.json();
    console.log('Contacts search result:', contactsResult);

    if (contactsResult.data?.items_by_column_values?.length) {
      mondayItemId = contactsResult.data.items_by_column_values[0].id;
      console.log('Found in Contacts board, ID:', mondayItemId);
    } else {
      // If not found in Contacts, search Leads board
      const leadsSearchQuery = {
        query: `query {
          items_by_column_values(
            board_id: 9643846394,
            column_id: "lead_phone",
            column_value: "${cleanPhone}"
          ) {
            id
            name
          }
        }`
      };

      const leadsSearchResponse = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQxMjcyMjUzNSwiYWFpIjoxMSwidWlkIjo2NDg2MzE3NCwiaWFkIjoiMjAyNC0wOS0xOVQwMDozNToxNS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQ5NTk4ODEsInJnbiI6InVzZTEifQ.OfbCtB8GlkDmSZWRay92lXx4LdejaevSMVMSplYYLeU',
          'Content-Type': 'application/json',
          'API-Version': '2024-10'
        },
        body: JSON.stringify(leadsSearchQuery)
      });

      const leadsResult = await leadsSearchResponse.json();
      console.log('Leads search result:', leadsResult);

      if (leadsResult.data?.items_by_column_values?.length) {
        mondayItemId = leadsResult.data.items_by_column_values[0].id;
        console.log('Found in Leads board, ID:', mondayItemId);
      }
    }

    // Check if customer/lead was found in either board
    if (!mondayItemId) {
      console.log('No Monday customer/lead found with phone:', cleanPhone);
      return res.status(200).json({ 
        message: 'Customer/lead not found in Monday.com, skipping timeline creation'
      });
    }

    // Create GraphQL mutation for timeline
    const timelineQuery = {
      query: `mutation {
        create_timeline_item(
          item_id: ${mondayItemId},
          title: "${title}",
          timestamp: "${isoTimestamp}",
          custom_activity_id: "6cf1cd71-b853-4e67-a43b-9ff9a0517bf0",
          content: "${messageText.replace(/"/g, '\\"')}"
        ) {
          id
        }
      }`
    };

    // Send timeline creation to Monday.com API
    const timelineResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQxMjcyMjUzNSwiYWFpIjoxMSwidWlkIjo2NDg2MzE3NCwiaWFkIjoiMjAyNC0wOS0xOVQwMDozNToxNS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQ5NTk4ODEsInJnbiI6InVzZTEifQ.OfbCtB8GlkDmSZWRay92lXx4LdejaevSMVMSplYYLeU',
        'Content-Type': 'application/json',
        'API-Version': '2024-10'
      },
      body: JSON.stringify(timelineQuery)
    });

    const timelineResult = await timelineResponse.json();
    console.log('Monday.com timeline response:', timelineResult);

    // Check if timeline creation was successful
    if (timelineResult.errors) {
      console.error('Monday.com timeline errors:', timelineResult.errors);
      return res.status(500).json({ 
        error: 'Failed to create timeline item',
        details: timelineResult.errors 
      });
    }

    // Return success to Respond.io
    return res.status(200).json({ 
      success: true,
      customer_id: mondayItemId,
      timeline_item_id: timelineResult.data?.create_timeline_item?.id,
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

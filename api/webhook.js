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
    const traffic = payload.message?.traffic;
    const rawPhone = payload.contact?.phone || '';
    
    // Clean phone number for Monday.com (remove + sign)
    const cleanPhone = rawPhone.replace(/^\+/, '');
    console.log('Cleaned phone number:', cleanPhone);
    
    // Convert timestamp from Unix to ISO format
    const isoTimestamp = new Date(timestamp).toISOString();
    
    // Create title with bold names
    const personName = `${firstName} ${lastName}`.trim();
    const agentName = payload.contact?.assignee?.firstName || 'Abogados Catrachos USA';
    
    const title = traffic === 'incoming' 
      ? `**${personName}**: ${messageText}`
      : `**${agentName}**: ${messageText}`;
    
    // Get the custom activity ID based on message direction
    const customActivityId = traffic === 'incoming' 
      ? 'f7bdbbd8-2ea6-4fca-b5a8-9a71947a1d9e'  // Blue for incoming
      : 'e88c6cbf-d884-43f6-ad7c-a105646f4e5a';  // Green for outgoing

    let mondayItemId = null;

    // Search Contacts board for matching phone number
    const contactsQuery = {
      query: `{
        boards(ids: [9643846519]) {
          items_page {
            items {
              id
              name
              column_values {
                id
                text
              }
            }
          }
        }
      }`
    };

    const contactsResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQxMjcyMjUzNSwiYWFpIjoxMSwidWlkIjo2NDg2MzE3NCwiaWFkIjoiMjAyNC0wOS0xOVQwMDozNToxNS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQ5NTk4ODEsInJnbiI6InVzZTEifQ.OfbCtB8GlkDmSZWRay92lXx4LdejaevSMVMSplYYLeU',
        'Content-Type': 'application/json',
        'API-Version': '2024-10'
      },
      body: JSON.stringify(contactsQuery)
    });

    const contactsResult = await contactsResponse.json();

    // Search through contacts for matching phone
    if (contactsResult.data?.boards?.[0]?.items_page?.items) {
      for (const item of contactsResult.data.boards[0].items_page.items) {
        const phoneColumn = item.column_values.find(col => col.id === 'contact_phone');
        if (phoneColumn && phoneColumn.text === cleanPhone) {
          mondayItemId = item.id;
          console.log(`Found contact with phone ${cleanPhone}, Monday ID: ${mondayItemId}`);
          break;
        }
      }
    }

    // If not found in contacts, search leads
    if (!mondayItemId) {
      const leadsQuery = {
        query: `{
          boards(ids: [9643846394]) {
            items_page {
              items {
                id
                name
                column_values {
                  id
                  text
                }
              }
            }
          }
        }`
      };

      const leadsResponse = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQxMjcyMjUzNSwiYWFpIjoxMSwidWlkIjo2NDg2MzE3NCwiaWFkIjoiMjAyNC0wOS0xOVQwMDozNToxNS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQ5NTk4ODEsInJnbiI6InVzZTEifQ.OfbCtB8GlkDmSZWRay92lXx4LdejaevSMVMSplYYLeU',
          'Content-Type': 'application/json',
          'API-Version': '2024-10'
        },
        body: JSON.stringify(leadsQuery)
      });

      const leadsResult = await leadsResponse.json();

      // Search through leads for matching phone
      if (leadsResult.data?.boards?.[0]?.items_page?.items) {
        for (const item of leadsResult.data.boards[0].items_page.items) {
          const phoneColumn = item.column_values.find(col => col.id === 'lead_phone');
          if (phoneColumn && phoneColumn.text === cleanPhone) {
            mondayItemId = item.id;
            console.log(`Found lead with phone ${cleanPhone}, Monday ID: ${mondayItemId}`);
            break;
          }
        }
      }
    }

    if (!mondayItemId) {
      console.log('Phone number not found in either board:', cleanPhone);
      return res.status(200).json({ 
        message: 'Phone number not found in Monday.com'
      });
    }

    // Create timeline item with bold names
    const timelineQuery = {
      query: `mutation {
        create_timeline_item(
          item_id: ${mondayItemId},
          title: "${title.replace(/"/g, '\\"')}",
          timestamp: "${isoTimestamp}",
          custom_activity_id: "${customActivityId}"
        ) {
          id
        }
      }`
    };

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
    console.log('Timeline creation result:', JSON.stringify(timelineResult, null, 2));

    if (timelineResult.errors) {
      return res.status(500).json({ 
        error: 'Failed to create timeline item',
        details: timelineResult.errors 
      });
    }

    return res.status(200).json({ 
      success: true,
      message: 'Timeline item created successfully',
      monday_id: mondayItemId
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

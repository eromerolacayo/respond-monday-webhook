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
    
    // Create title and content - separate them properly
    const personName = `${firstName} ${lastName}`.trim();
    const agentName = payload.contact?.assignee?.firstName || 'Abogados Catrachos USA';
    
    // For the title, keep it short (this is what shows as the header)
    const title = traffic === 'incoming' 
      ? `Message from ${personName || 'Unknown Contact'}`
      : `Reply to ${personName || 'Unknown Contact'}`;
    
    // For content, include the full message (this is what shows in the expandable area)
    const content = messageText; // Don't truncate the content - let Monday.com handle display
    
    // Get the custom activity ID based on message direction
    const customActivityId = traffic === 'incoming' 
      ? 'f7bdbbd8-2ea6-4fca-b5a8-9a71947a1d9e'  // Blue for incoming
      : 'e88c6cbf-d884-43f6-ad7c-a105646f4e5a';  // Green for outgoing

    let mondayItemId = null;
    let foundInBoard = null;

    // Function to search for contact by phone
    async function searchInBoard(boardId, phoneColumnId) {
      const query = {
        query: `{
          boards(ids: [${boardId}]) {
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

      const response = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQxMjcyMjUzNSwiYWFpIjoxMSwidWlkIjo2NDg2MzE3NCwiaWFkIjoiMjAyNC0wOS0xOVQwMDozNToxNS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQ5NTk4ODEsInJnbiI6InVzZTEifQ.OfbCtB8GlkDmSZWRay92lXx4LdejaevSMVMSplYYLeU',
          'Content-Type': 'application/json',
          'API-Version': '2024-10'
        },
        body: JSON.stringify(query)
      });

      const result = await response.json();

      if (result.data?.boards?.[0]?.items_page?.items) {
        for (const item of result.data.boards[0].items_page.items) {
          const phoneColumn = item.column_values.find(col => col.id === phoneColumnId);
          if (phoneColumn && phoneColumn.text === cleanPhone) {
            return item.id;
          }
        }
      }
      return null;
    }

    // Function to create new lead
    async function createNewLead() {
      console.log('Creating new lead for phone:', cleanPhone);
      
      const createLeadMutation = {
        query: `mutation {
          create_item(
            board_id: 9643846394,
            item_name: "${personName || 'Unknown Contact'}",
            column_values: "${JSON.stringify({
              lead_phone: cleanPhone
            }).replace(/"/g, '\\"')}"
          ) {
            id
          }
        }`
      };

      const response = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjQxMjcyMjUzNSwiYWFpIjoxMSwidWlkIjo2NDg2MzE3NCwiaWFkIjoiMjAyNC0wOS0xOVQwMDozNToxNS4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjQ5NTk4ODEsInJnbiI6InVzZTEifQ.OfbCtB8GlkDmSZWRay92lXx4LdejaevSMVMSplYYLeU',
          'Content-Type': 'application/json',
          'API-Version': '2024-10'
        },
        body: JSON.stringify(createLeadMutation)
      });

      const result = await response.json();
      console.log('Lead creation result:', JSON.stringify(result, null, 2));

      if (result.data?.create_item?.id) {
        return result.data.create_item.id;
      } else {
        console.error('Failed to create lead:', result.errors);
        return null;
      }
    }

    // First attempt: Search Contacts board
    mondayItemId = await searchInBoard(9643846519, 'contact_phone');
    if (mondayItemId) {
      foundInBoard = 'contacts';
      console.log(`Found contact with phone ${cleanPhone}, Monday ID: ${mondayItemId}`);
    }

    // If not found in contacts, search leads
    if (!mondayItemId) {
      mondayItemId = await searchInBoard(9643846394, 'lead_phone');
      if (mondayItemId) {
        foundInBoard = 'leads';
        console.log(`Found lead with phone ${cleanPhone}, Monday ID: ${mondayItemId}`);
      }
    }

    // If still not found, wait 1 minute for Zapier to potentially create the contact
    if (!mondayItemId) {
      console.log('Contact not found, waiting 1 minute for Zapier...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      
      // Try contacts board again after delay
      mondayItemId = await searchInBoard(9643846519, 'contact_phone');
      if (mondayItemId) {
        foundInBoard = 'contacts';
        console.log(`Found contact after delay with phone ${cleanPhone}, Monday ID: ${mondayItemId}`);
      }
    }

    // If still not found after delay, create new lead
    if (!mondayItemId) {
      mondayItemId = await createNewLead();
      if (mondayItemId) {
        foundInBoard = 'leads';
        console.log(`Created new lead with phone ${cleanPhone}, Monday ID: ${mondayItemId}`);
      }
    }

    // If we still don't have an ID, something went wrong
    if (!mondayItemId) {
      console.error('Failed to find or create contact/lead for phone:', cleanPhone);
      return res.status(500).json({ 
        error: 'Failed to find or create contact/lead',
        phone: cleanPhone
      });
    }

    // Create timeline item with proper escaping for content
    const escapedContent = content.replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    const escapedTitle = title.replace(/"/g, '\\"');
    
    const timelineQuery = {
      query: `mutation {
        create_timeline_item(
          item_id: ${mondayItemId},
          title: "${escapedTitle}",
          content: "${escapedContent}",
          timestamp: "${isoTimestamp}",
          custom_activity_id: "${customActivityId}"
        ) {
          id
          title
          content
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
      monday_id: mondayItemId,
      found_in_board: foundInBoard,
      timeline_item_id: timelineResult.data?.create_timeline_item?.id,
      created_new_lead: foundInBoard === 'leads' && !foundInBoard
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

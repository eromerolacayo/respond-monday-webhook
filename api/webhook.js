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
    const firstName    = payload.contact?.firstName  || '';
    const lastName     = payload.contact?.lastName   || '';
    const messageText  = payload.message?.message?.text || '';
    const timestamp    = payload.message?.timestamp;
    const traffic      = payload.message?.traffic;
    const rawPhone     = payload.contact?.phone      || '';

    // Clean phone number for Monday.com (remove + sign)
    const cleanPhone = rawPhone.replace(/^\+/, '');
    console.log('Cleaned phone number:', cleanPhone);

    // Convert timestamp to ISO
    const isoTimestamp = new Date(timestamp).toISOString();

    // Build plain-text title (no bold/formatting)
    const personName = `${firstName} ${lastName}`.trim() || '';
    const agentName  = payload.contact?.assignee?.firstName || 'Abogados Catrachos USA';
    const who         = traffic === 'incoming' ? personName : agentName;
    const title       = `${who}: ${messageText}`;

    // Choose activity color
    const customActivityId = traffic === 'incoming'
      ? 'f7bdbbd8-2ea6-4fca-b5a8-9a71947a1d9e'  // Blue for incoming
      : 'e88c6cbf-d884-43f6-ad7c-a105646f4e5a'; // Green for outgoing

    let mondayItemId = null;

    // 1) Search Contacts & Leads boards
    const boardsToSearch = [
      { id: 9643846519, phoneCol: 'contact_phone' },
      { id: 9643846394, phoneCol: 'lead_phone' }
    ];

    for (const { id, phoneCol } of boardsToSearch) {
      const query = {
        query: `{
          boards(ids: [${id}]) {
            items_page {
              items {
                id
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
          'Authorization': process.env.MONDAY_API_KEY,
          'Content-Type': 'application/json',
          'API-Version': '2024-10'
        },
        body: JSON.stringify(query)
      });

      const result = await response.json();
      const items  = result.data?.boards?.[0]?.items_page?.items || [];

      const match = items.find(item => {
        const col = item.column_values.find(c => c.id === phoneCol);
        return col?.text === cleanPhone;
      });

      if (match) {
        mondayItemId = match.id;
        console.log(`Found item ${mondayItemId} in board ${id}`);
        break;
      }
    }

    if (!mondayItemId) {
      console.log('Phone number not found:', cleanPhone);
      return res.status(200).json({ message: 'Phone number not found in Monday.com' });
    }

    // 2) Create timeline entry
    const mutation = {
      query: `mutation {
        create_timeline_item(
          item_id: ${mondayItemId},
          title: "${title.replace(/"/g, '\\"')}",
          timestamp: "${isoTimestamp}",
          custom_activity_id: "${customActivityId}"
        ) { id }
      }`
    };

    const timelineRes = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Authorization': process.env.MONDAY_API_KEY,
        'Content-Type': 'application/json',
        'API-Version': '2024-10'
      },
      body: JSON.stringify(mutation)
    });

    const timelineJson = await timelineRes.json();
    console.log('Timeline creation:', timelineJson);

    if (timelineJson.errors) {
      return res.status(500).json({ 
        error: 'Failed to create timeline item',
        details: timelineJson.errors
      });
    }

    return res.status(200).json({
      success: true,
      monday_id: mondayItemId
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: err.message
    });
  }
}

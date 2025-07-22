// api/webhook.js - Vercel serverless function
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload      = req.body;
    const firstName    = payload.contact?.firstName  || '';
    const lastName     = payload.contact?.lastName   || '';
    const rawPhone     = payload.contact?.phone      || '';
    const messageText  = payload.message?.message?.text || '';
    const timestamp    = payload.message?.timestamp;
    const traffic      = payload.message?.traffic;

    /* ---------- helpers ---------- */
    const cleanPhone   = rawPhone.replace(/^\+/, '');
    const isoTimestamp = new Date(timestamp).toISOString();
    const name         = `${firstName} ${lastName}`.trim() || cleanPhone;
    const assigneeName = payload.contact?.assignee?.firstName || 'Abogados Catrachos USA';

    // strip WhatsApp markdown (* _ ~ `) so Monday won't show raw asterisks
    const sanitize = txt => txt.replace(/[*_~`]/g, '');

    const who   = traffic === 'incoming' ? name : assigneeName;
    const title = `${who}: ${sanitize(messageText)}`;

    const customActivityId =
      traffic === 'incoming'
        ? 'f7bdbbd8-2ea6-4fca-b5a8-9a71947a1d9e' // incoming blue
        : 'e88c6cbf-d884-43f6-ad7c-a105646f4e5a'; // outgoing green

    /* ---------- search both boards ---------- */
    const BOARDS = [
      { id: 9643846519, phoneCol: 'contact_phone' }, // Contacts
      { id: 9643846394, phoneCol: 'lead_phone'    }  // Leads
    ];

    const mondayQuery = q =>
      fetch('https://api.monday.com/v2', {
        method : 'POST',
        headers: {
          Authorization : process.env.MONDAY_API_KEY,
          'Content-Type': 'application/json',
          'API-Version' : '2024-10'
        },
        body: JSON.stringify({ query: q })
      }).then(r => r.json());

    let mondayItemId = null;

    for (const { id, phoneCol } of BOARDS) {
      const q = `{
        boards(ids:[${id}]) {
          items_page {
            items {
              id
              column_values { id text }
            }
          }
        }
      }`;
      const data = await mondayQuery(q);
      const items = data.data?.boards?.[0]?.items_page?.items || [];
      const hit = items.find(it => it.column_values
        .some(cv => cv.id === phoneCol && cv.text === cleanPhone));
      if (hit) {
        mondayItemId = hit.id;
        break;
      }
    }

    /* ---------- auto-create contact if missing ---------- */
    if (!mondayItemId) {
      console.log(`Phone not found, auto-creating contact: ${cleanPhone}`);

      const columnVals = JSON.stringify({
        contact_phone: cleanPhone        // <-- column ID for phone
        // add more initial columns if you like
      });

      const createMutation = `mutation {
        create_item (
          board_id: 9643846519,          // Contacts board
          item_name: "${name.replace(/"/g, '\\"')}",
          column_values: "${columnVals.replace(/"/g, '\\"')}"
        ) { id }
      }`;

      const createRes = await mondayQuery(createMutation);
      mondayItemId = createRes.data?.create_item?.id;

      if (!mondayItemId) {
        throw new Error('Auto-create failed; no ID returned');
      }
    }

    /* ---------- create timeline entry ---------- */
    const timelineMutation = `mutation {
      create_timeline_item(
        item_id: ${mondayItemId},
        title: "${title.replace(/"/g, '\\"')}",
        timestamp: "${isoTimestamp}",
        custom_activity_id: "${customActivityId}"
      ) { id }
    }`;

    const timelineRes = await mondayQuery(timelineMutation);

    if (timelineRes.errors) {
      console.error('Timeline error', timelineRes.errors);
      return res.status(500).json({
        error  : 'Failed to create timeline item',
        details: timelineRes.errors
      });
    }

    return res.status(200).json({ success: true, monday_id: mondayItemId });

  } catch (err) {
    console.error('Webhook error', err);
    return res.status(500).json({
      error  : 'Internal server error',
      details: err.message
    });
  }
}

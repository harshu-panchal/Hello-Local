const dns = require('dns');

const domains = [
    '_mongodb._tcp.cluster0.sd57rah.mongodb.net',
    'cluster0.sd57rah.mongodb.net'
];

async function resolve() {
    try {
        const srv = await new Promise((resolve, reject) => {
            dns.resolveSrv(domains[0], (err, res) => err ? reject(err) : resolve(res));
        });
        console.log('SRV:', JSON.stringify(srv, null, 2));

        const txt = await new Promise((resolve, reject) => {
            dns.resolveTxt(domains[1], (err, res) => err ? reject(err) : resolve(res));
        });
        console.log('TXT:', JSON.stringify(txt, null, 2));
    } catch (e) {
        console.error('Resolution failed:', e.message);
    }
}

resolve();

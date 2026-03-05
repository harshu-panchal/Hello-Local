const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const domain = '_mongodb._tcp.cluster0.sd57rah.mongodb.net';

dns.resolveSrv(domain, (err, addresses) => {
    if (err) {
        console.error('SRV Error with 8.8.8.8:', err);
        return;
    }
    console.log('✓ Resolved SRV with 8.8.8.8:', JSON.stringify(addresses, null, 2));

    const host = addresses[0].name;
    dns.resolve4(host, (err, ips) => {
        if (err) {
            console.error('A Error for', host, ':', err);
            return;
        }
        console.log('✓ Resolved IPs for', host, ':', ips);
    });
});

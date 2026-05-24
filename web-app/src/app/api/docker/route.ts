import { NextResponse } from 'next/server';
import http from 'http';

// Helper to query the Docker UNIX socket
function queryDocker(path: string, method: string = 'GET', body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      socketPath: '/var/run/docker.sock',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      // For logs, fetch the raw buffer stream
      if (path.includes('/logs')) {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({
            statusCode: res.statusCode,
            rawBuffer: buffer,
          });
        });
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch (e) {
            resolve(data);
          }
        } else {
          resolve({
            error: `Docker Daemon Error: ${res.statusCode}`,
            details: data,
            statusCode: res.statusCode,
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper to parse Docker socket logs which contain an 8-byte multiplex header if TTY is false
function parseDockerLogs(buffer: Buffer): string {
  if (!buffer || buffer.length === 0) return '';
  
  let logs = '';
  let offset = 0;
  
  // Verify if it has multiplex headers (Byte 0: 0/1/2, Bytes 4-7: length in big-endian)
  let isMultiplexed = false;
  if (buffer.length >= 8) {
    const firstByte = buffer.readUInt8(0);
    const size = buffer.readUInt32BE(4);
    if ((firstByte === 0 || firstByte === 1 || firstByte === 2) && size < buffer.length) {
      isMultiplexed = true;
    }
  }

  if (isMultiplexed) {
    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) {
        logs += buffer.toString('utf8', offset);
        break;
      }
      const streamType = buffer.readUInt8(offset); // 1 = stdout, 2 = stderr
      const size = buffer.readUInt32BE(offset + 4);
      if (offset + 8 + size > buffer.length) {
        logs += buffer.toString('utf8', offset + 8);
        break;
      }
      const text = buffer.toString('utf8', offset + 8, offset + 8 + size);
      
      // Optionally add stream prefix
      const prefix = streamType === 2 ? '[STDERR] ' : '';
      logs += prefix + text;
      offset += 8 + size;
    }
  } else {
    logs = buffer.toString('utf8');
  }
  return logs;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'list';
    const container = searchParams.get('container');
    const tail = searchParams.get('tail') || '200';

    if (action === 'logs') {
      if (!container) {
        return NextResponse.json({ success: false, error: 'Container name or ID is required' }, { status: 400 });
      }

      // Query logs from Docker daemon
      const result = await queryDocker(`/containers/${container}/logs?stdout=true&stderr=true&tail=${tail}&timestamps=true`);
      if (result.rawBuffer) {
        const textLogs = parseDockerLogs(result.rawBuffer);
        return NextResponse.json({ success: true, logs: textLogs });
      }
      return NextResponse.json({ success: false, error: 'Failed to fetch logs', details: result });
    }

    if (action === 'stats') {
      if (!container) {
        return NextResponse.json({ success: false, error: 'Container name or ID is required' }, { status: 400 });
      }
      const result = await queryDocker(`/containers/${container}/stats?stream=false`);
      return NextResponse.json({ success: true, stats: result });
    }

    // Default: List containers
    const containers = await queryDocker('/containers/json?all=true');
    if (containers.error) {
      return NextResponse.json({ 
        success: false, 
        error: containers.error,
        details: 'Apakah Docker socket (/var/run/docker.sock) sudah dimount dengan benar?'
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, containers });
  } catch (error: any) {
    console.error('[Docker API] Error:', error.message);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      details: 'Docker socket tidak dapat diakses. Pastikan service docker berjalan di host VPS.'
    }, { status: 500 });
  }
}

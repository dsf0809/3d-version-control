import { readBody, json, failure, HttpError } from '@/lib/projects/http';
import { accounts, requireAdmin } from '@/lib/server/auth';
import { projectStore } from '@/lib/projects/db';
import { setSharingPolicy, sharingPolicy } from '@/lib/projects/ai-credentials';
import { networkInterfaces } from 'node:os';
/** Addresses other devices on the network can use to reach this server. */
const addresses = (request: Request) => {
  const port = new URL(request.url).port;
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a!.address}${port ? ':' + port : ''}`);
};
const settings = async (request: Request) => ({
  joinCode: await accounts().joinCode(),
  sharing: await sharingPolicy(projectStore()),
  addresses: addresses(request),
});
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return json(await settings(request));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await readBody(request, 4096);
    if (body.action === 'rotate-code') await accounts().setJoinCode(true);
    else if (body.action === 'disable-code')
      await accounts().setJoinCode(false);
    else if (body.action === 'sharing') {
      if (body.shared !== undefined && typeof body.shared !== 'boolean')
        throw new HttpError(400, 'Invalid sharing setting.');
      await setSharingPolicy(projectStore(), {
        shared: body.shared,
        dailyLimit: body.dailyLimit,
      });
    } else throw new HttpError(400, 'Unknown setting.');
    return json(await settings(request));
  } catch (e) {
    return failure(e);
  }
}

import {
  createRaidGroup,
  deleteRaidGroupSession,
  getRaidGroupSession,
  joinRaidGroup,
  makeExpiredSessionCookie,
  makeSessionCookie,
  mutateRaidGroup,
  RaidGroupError,
} from "../../lib/raidGroupStore";

export async function GET(request: Request) {
  try {
    const session = await getRaidGroupSession(request);
    if (!session) return unauthorized();

    const url = new URL(request.url);
    const since = Number(url.searchParams.get("since"));
    const week = url.searchParams.get("week");
    if (
      Number.isFinite(since) &&
      since === session.snapshot.room.revision &&
      week === session.snapshot.raidWeek
    ) {
      return new Response(null, { status: 204 });
    }

    return Response.json(session.snapshot);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      name?: unknown;
      password?: unknown;
      players?: unknown;
    };
    const result =
      body.action === "create"
        ? await createRaidGroup(body.name, body.password, body.players)
        : body.action === "join"
          ? await joinRaidGroup(body.name, body.password)
          : null;

    if (!result) {
      throw new RaidGroupError("요청 형식이 올바르지 않습니다.", 400);
    }

    const response = Response.json(result.snapshot, { status: 200 });
    response.headers.append("Set-Cookie", makeSessionCookie(request, result.token));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getRaidGroupSession(request);
    if (!session) return unauthorized();
    const body = (await request.json()) as { operation?: unknown };
    const result = await mutateRaidGroup(session.roomId, body.operation);
    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getRaidGroupSession(request);
    await deleteRaidGroupSession(session?.tokenHash ?? null);
    const response = new Response(null, { status: 204 });
    response.headers.append("Set-Cookie", makeExpiredSessionCookie(request));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

const unauthorized = () =>
  Response.json({ message: "공격대에 가입해야 합니다." }, { status: 401 });

const errorResponse = (error: unknown) => {
  if (error instanceof RaidGroupError) {
    return Response.json({ message: error.message }, { status: error.status });
  }
  console.error("Raid group API error", error);
  return Response.json(
    { message: "서버 저장소를 처리하지 못했습니다." },
    { status: 500 },
  );
};

"use server";

import { revalidatePath } from "next/cache";

import { TicketStatus, type TicketStatus as TicketStatusValue } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { requireLocalOperationsRequest } from "./security";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nextStatus(status: TicketStatusValue) {
  switch (status) {
    case TicketStatus.OPEN:
      return TicketStatus.IN_PROGRESS;
    case TicketStatus.IN_PROGRESS:
      return TicketStatus.RESOLVED;
    case TicketStatus.RESOLVED:
      return TicketStatus.CLOSED;
    case TicketStatus.CLOSED:
      return null;
  }
}

export async function advanceTicketFromDashboard(formData: FormData) {
  await requireLocalOperationsRequest();

  const ticketId = String(formData.get("ticketId") ?? "");
  const confirmed = formData.get("confirmed") === "yes";

  if (!UUID_PATTERN.test(ticketId)) {
    throw new Error("A valid ticket ID is required.");
  }
  if (!confirmed) {
    throw new Error("Confirm the one-step status change before continuing.");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true },
  });

  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  const next = nextStatus(ticket.status);

  if (!next) {
    return;
  }

  const updated = await prisma.ticket.updateMany({
    where: { id: ticketId, status: ticket.status },
    data: { status: next },
  });

  if (updated.count !== 1) {
    throw new Error("This ticket changed while you were updating it. Refresh and try again.");
  }

  revalidatePath("/operations");
}

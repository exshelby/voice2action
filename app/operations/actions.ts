"use server";

import { revalidatePath } from "next/cache";

import {
  NotificationStatus,
  NotificationType,
  TicketStatus,
  TicketTeam,
  TicketWorklogType,
  type TicketStatus as TicketStatusValue,
  type TicketTeam as TicketTeamValue,
  type TicketWorklogType as TicketWorklogTypeValue,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { requireLocalOperationsRequest } from "./security";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEAM_VALUES = new Set<TicketTeamValue>(Object.values(TicketTeam));
const WORKLOG_TYPE_VALUES = new Set<TicketWorklogTypeValue>(Object.values(TicketWorklogType));

const TEAM_LABELS: Record<TicketTeamValue, string> = {
  LOGISTICS: "Logistics",
  QUALITY: "Quality",
  FINANCE: "Finance",
  CUSTOMER_SUPPORT: "Customer Support",
  TECHNICAL_SUPPORT: "Technical Support",
  CUSTOMER_EXPERIENCE: "Customer Experience",
  GENERAL_SUPPORT: "General Support",
};

function ticketReference(ticketNumber: number) {
  return `TKT-${String(ticketNumber).padStart(6, "0")}`;
}

function revalidateTicketPages(ticketNumber: number) {
  revalidatePath("/operations");
  revalidatePath(`/operations/tickets/${ticketNumber}`);
}

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
    select: { status: true, ticketNumber: true },
  });

  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  const next = nextStatus(ticket.status);

  if (!next) {
    return;
  }

  if (ticket.status === TicketStatus.IN_PROGRESS) {
    const resolutionNotes = await prisma.ticketWorklog.count({
      where: { ticketId, type: TicketWorklogType.RESOLUTION },
    });

    if (resolutionNotes === 0) {
      throw new Error("Add a resolution note before moving this ticket to Resolved.");
    }
  }

  const updated = await prisma.ticket.updateMany({
    where: { id: ticketId, status: ticket.status },
    data: { status: next },
  });

  if (updated.count !== 1) {
    throw new Error("This ticket changed while you were updating it. Refresh and try again.");
  }

  revalidateTicketPages(ticket.ticketNumber);
}

export async function addTicketWorklogFromDashboard(formData: FormData) {
  await requireLocalOperationsRequest();

  const ticketId = String(formData.get("ticketId") ?? "");
  const type = String(formData.get("type") ?? "") as TicketWorklogTypeValue;
  const body = String(formData.get("body") ?? "").trim();
  const confirmed = formData.get("confirmed") === "yes";

  if (!UUID_PATTERN.test(ticketId)) {
    throw new Error("A valid ticket ID is required.");
  }
  if (!WORKLOG_TYPE_VALUES.has(type)) {
    throw new Error("Choose a valid work-log type.");
  }
  if (body.length < 1 || body.length > 5000) {
    throw new Error("The work-log note must contain between 1 and 5,000 characters.");
  }
  if (!confirmed) {
    throw new Error("Confirm this append-only work-log entry before continuing.");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true, ticketNumber: true },
  });

  if (!ticket) {
    throw new Error("Ticket not found.");
  }
  if (ticket.status === TicketStatus.CLOSED) {
    throw new Error("Closed tickets cannot receive new work-log entries.");
  }

  await prisma.ticketWorklog.create({
    data: { ticketId, type, body },
  });

  revalidateTicketPages(ticket.ticketNumber);
}

export async function reassignTicketFromDashboard(formData: FormData) {
  await requireLocalOperationsRequest();

  const ticketId = String(formData.get("ticketId") ?? "");
  const selectedTeam = String(formData.get("team") ?? "") as TicketTeamValue;
  const confirmed = formData.get("confirmed") === "yes";

  if (!UUID_PATTERN.test(ticketId)) {
    throw new Error("A valid ticket ID is required.");
  }
  if (!TEAM_VALUES.has(selectedTeam)) {
    throw new Error("Choose a valid operational team.");
  }
  if (!confirmed) {
    throw new Error("Confirm the team reassignment before continuing.");
  }

  const ticketNumber = await prisma.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { id: ticketId },
      select: {
        assignedTeam: true,
        description: true,
        ticketNumber: true,
        title: true,
      },
    });

    if (!ticket) {
      throw new Error("Ticket not found.");
    }

    if (ticket.assignedTeam === selectedTeam) {
      return ticket.ticketNumber;
    }

    const updated = await transaction.ticket.updateMany({
      where: { id: ticketId, assignedTeam: ticket.assignedTeam },
      data: {
        assignedTeam: selectedTeam,
        assignedAt: new Date(),
        assignmentRuleVersion: null,
      },
    });

    if (updated.count !== 1) {
      throw new Error("This ticket was reassigned by another operator. Refresh and try again.");
    }

    const reference = ticketReference(ticket.ticketNumber);
    const teamLabel = TEAM_LABELS[selectedTeam];

    await transaction.notification.upsert({
      where: {
        ticketId_eventType: {
          ticketId,
          eventType: NotificationType.TICKET_ASSIGNED,
        },
      },
      create: {
        ticketId,
        team: selectedTeam,
        eventType: NotificationType.TICKET_ASSIGNED,
        subject: `New ticket ${reference}: ${ticket.title}`,
        message: `${reference} was assigned to your team. ${ticket.description}`,
      },
      update: {
        team: selectedTeam,
        subject: `Reassigned ticket ${reference}: ${ticket.title}`,
        message: `${reference} was reassigned to ${teamLabel}. ${ticket.description}`,
        status: NotificationStatus.PENDING,
        attemptCount: 0,
        lastError: null,
        sentAt: null,
      },
    });

    return ticket.ticketNumber;
  });

  revalidateTicketPages(ticketNumber);
}

export async function markNotificationDeliveredFromDashboard(formData: FormData) {
  await requireLocalOperationsRequest();

  const notificationId = Number(formData.get("notificationId"));
  const confirmed = formData.get("confirmed") === "yes";

  if (!Number.isSafeInteger(notificationId) || notificationId < 1) {
    throw new Error("A valid notification ID is required.");
  }
  if (!confirmed) {
    throw new Error("Confirm that the team received this alert before continuing.");
  }

  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: {
      status: true,
      ticket: { select: { ticketNumber: true } },
    },
  });

  if (!notification) {
    throw new Error("Notification not found.");
  }
  if (notification.status !== NotificationStatus.PENDING) {
    throw new Error("Only a pending notification can be marked as delivered.");
  }

  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, status: NotificationStatus.PENDING },
    data: {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      attemptCount: { increment: 1 },
      lastError: null,
    },
  });

  if (updated.count !== 1) {
    throw new Error("This notification changed while you were updating it. Refresh and try again.");
  }

  revalidateTicketPages(notification.ticket.ticketNumber);
}

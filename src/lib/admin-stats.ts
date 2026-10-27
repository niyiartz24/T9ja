import { db } from "@/lib/db";

/** All dashboard numbers come straight from the database, in one parallel round trip. */
export async function platformStats() {
  const [organizers, events, payments, tickets, orders, review, refundDue, recentOrders, topRaw] = await Promise.all([
    db.user.count({ where: { role: "ORGANIZER" } }),
    db.event.groupBy({ by: ["status"], _count: true }),
    db.payment.groupBy({ by: ["status"], _count: true, _sum: { amountMinor: true } }),
    db.ticket.groupBy({ by: ["status"], _count: true }),
    db.order.groupBy({ by: ["status"], _count: true }),
    db.payment.count({ where: { status: "REVIEW" } }),
    db.payment.count({ where: { refundRequired: true, status: { not: "REFUNDED" } } }),
    db.order.findMany({
      orderBy: { createdAt: "desc" }, take: 8,
      select: { reference: true, buyerName: true, totalMinor: true, currency: true, status: true, createdAt: true, event: { select: { title: true } } },
    }),
    db.order.groupBy({ by: ["eventId"], where: { status: "PAID", totalMinor: { gt: 0 } }, _sum: { totalMinor: true }, _count: true, orderBy: { _sum: { totalMinor: "desc" } }, take: 5 }),
  ]);
  const titles = topRaw.length
    ? await db.event.findMany({ where: { id: { in: topRaw.map((t) => t.eventId) } }, select: { id: true, title: true, organizer: { select: { name: true, email: true } } } })
    : [];
  const topEvents = topRaw.map((t) => {
    const e = titles.find((x) => x.id === t.eventId);
    return { eventId: t.eventId, title: e?.title ?? "(deleted)", organizer: e?.organizer.name ?? e?.organizer.email ?? "", revenueMinor: t._sum.totalMinor ?? 0, paidOrders: t._count };
  });
  const count = <T extends { status: string; _count: number }>(rows: T[], s: string) => rows.find((r) => r.status === s)?._count ?? 0;
  const amount = (s: string) => payments.find((p) => p.status === s)?._sum.amountMinor ?? 0;
  return {
    organizers,
    events: { published: count(events, "PUBLISHED"), draft: count(events, "DRAFT"), cancelled: count(events, "CANCELLED"), completed: count(events, "COMPLETED") },
    money: {
      succeeded: { count: count(payments, "SUCCEEDED"), minor: amount("SUCCEEDED") },
      pending: { count: count(payments, "PENDING") + count(payments, "INITIATED"), minor: amount("PENDING") + amount("INITIATED") },
      refunded: { count: count(payments, "REFUNDED"), minor: amount("REFUNDED") },
    },
    tickets: { issued: tickets.reduce((a, t) => a + t._count, 0), used: count(tickets, "USED"), valid: count(tickets, "VALID") },
    orders: { paid: count(orders, "PAID"), pending: count(orders, "PENDING"), total: orders.reduce((a, o) => a + o._count, 0) },
    attention: { review, refundDue },
    recentOrders,
    topEvents,
  };
}

# Replacement Desk

Replacement Desk coordinates two warehouse order workflows and the people authorized to move each workflow forward.

## Language

**Team Member**:
An authenticated internal user who has an active operational profile and one or more Roles.
_Avoid_: Customer, account

**Role**:
A permission-bearing warehouse responsibility such as Customer Support, Logistics, Printing, Packing, HR, Consignment, Boss, or Admin. A Team Member may hold several Roles.
_Avoid_: User type, department account

**Administrator Bootstrap**:
The one-time establishment of the workspace's first administrator. Once completed, it never reopens automatically.
_Avoid_: Default admin, admin signup

**Replacement Order**:
A customer-facing replacement request that moves through label preparation, printing, packing QC, packing, shipment, and delivery.
_Avoid_: Offline order, replacement item

**Offline Order**:
A business fulfilment request that moves through packing, dispatch preparation, printing, pickup, delivery, and acknowledgement.
_Avoid_: Replacement order

**Order ID**:
The shared human-facing numeric identifier used across both order workflows. A deliberately changed Order ID establishes the starting point for the next generated ID.
_Avoid_: Database ID, replacement number, SO number

**Order Item**:
One product and quantity belonging to an order. Customer, shipment, dimensions, files, and workflow state belong to the order rather than each item.
_Avoid_: Order, product order

**Replacement Number**:
The generated `REP` identifier used only for replacement workflow traceability.
_Avoid_: Order ID, courier reference

**SO Number**:
The business sales-order reference used only by an Offline Order.
_Avoid_: Order ID, replacement number

**Activity**:
An immutable, actor-attributed record of an order action, comment, or administrative override.
_Avoid_: Editable note

**Dimension Preset**:
A reusable centimetre measurement set for commonly shipped replacement packages.
_Avoid_: Product dimension

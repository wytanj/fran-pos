# mirror-member-phone — Class C HOLD (draft PR only)

## Goal
On member signup/lookup from cashier: open a phone dialog on customer mirror (S10B). Country code + number only (no name). After submit, mirror and cashier show whether the number is already a member.

## Approach
- Reuse `FranCrmClient.resolveMember` (no new member SoT).
- Migration `00022_mirror_face_input.sql`: `face_input` jsonb + seq; RPCs submit/read/clear.
- Mirror phase `member_phone` (awaiting | result).
- FranCustomerModal "Ask on mirror"; face large tablet phone UI; country priority SG,MY,ID,CN,KR,JP,US,UK then others; default SG.

## Hold
Class C HOLD — do not merge until JT/CoS clear. Stage Class D for prod migration apply.

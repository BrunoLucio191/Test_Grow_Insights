import { getDate } from "date-fns";

type DateRange = {
  from: string;
  to: string;
};
const range: DateRange = {
  from: "2026-04-10",
  to: "2026-11-2",
};

export function cliplingOrganicDate(range: DateRange): DateRange {
  const daysInMiliseconds29 = 2505600000;
  let newRangeTo = "";
  let newRangeFrom = "";
  const dateToChangeToSlice = new Date();
  const dateToChangeForSlice = new Date();

  const actualTimeRange = Math.abs(new Date(range.to).getTime() - new Date(range.from).getTime());

  if (actualTimeRange > daysInMiliseconds29) {
    dateToChangeToSlice.setDate(new Date().getDate() - 15);
    dateToChangeToSlice.setDate(new Date().getDate() - 1);

    dateToChangeForSlice.setDate(new Date().getDate() - 2);
    newRangeFrom = dateToChangeToSlice.toISOString().split("T")[0];
    newRangeTo = dateToChangeForSlice.toISOString().split("T")[0];

    return { from: newRangeFrom, to: newRangeTo };
  }

  return range;
}

console.log(cliplingOrganicDate(range));

import mongoose, { Schema } from "mongoose";

const subscriptionShema = mongoose.Schema(
  {
    follower: {
      type: Schema.Types.ObjectId, // The user who is following
      ref: "User",
    },
    followedUser: {
      type: Schema.Types.ObjectId, // The user who is being followed
      ref: "User",
    },
  },
  { timestamps: true },
);

export const Subscription = mongoose.model("Subscription", subscriptionShema);

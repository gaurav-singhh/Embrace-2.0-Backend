import { Router } from "express";
import { upload } from "../middlewares/multer.middleware.js";
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  getUserPageProfile,
  getWatchHistory,
} from "../controllers/user.controller.js";

import { deleteOnCloudinary } from "../utils/cloudinary.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
  ]),
  registerUser,
);

router.route("/login").post(loginUser);
router.route("/logout").post(verifyJWT, logoutUser); // isiliye wo next likhte hai phele run hone ke baad next fn run karo.
router.route("/update-profile").post(verifyJWT, updateAccountDetails);
router.route("/update-password").post(verifyJWT, changeCurrentPassword);
router.route("/Current-User").get(verifyJWT, getCurrentUser);
router.route("/User-Page-Profile").get(verifyJWT, getUserPageProfile); // guest user can also view the profiles of other ? the remove verfyjwt.

router.route("/update-Avatar").post(
  verifyJWT,
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
  ]),
  updateUserAvatar,
);

router.route("/watch-history").get(verifyJWT, getWatchHistory);

export default router;
